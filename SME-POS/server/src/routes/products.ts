/** Products routes — port of ProductController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
import { addStarters, defaultBranch, missingStarters } from '../domain/catalogue.js';
import { businessTypeFor, isUnstockedCategory } from '../domain/businessTypes.js';

export const productRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);
const isAdmin = (role: string) => ADMIN_ROLES.has(role);

// GET /products
productRoutes.get('/', async (ctx) => {
  const tenant = ctx.get('tenant');
  const search = ctx.req.query('q')?.trim() ?? '';

  const page = parseInt(ctx.req.query('page') ?? '1');
  const perPage = 30;
  const skip = (page - 1) * perPage;

  const where: any = {
    tenantId: tenant.id,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
            { brand: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // Stock is per branch (StockLevel is keyed by branch + product) and each
  // till only ever sees its own branch. This list used to sum every level
  // row — including rows on deleted branches — into one "on hand" and judge
  // low stock on that total, so a branch at 0 was hidden by another branch's
  // surplus and stock of a removed branch still counted. Now: only live
  // branches count, a per-branch split is returned, and ?branchId= narrows
  // the whole view to one branch (matching what that branch's till shows).
  const branchParam = ctx.req.query('branchId') || null;
  const branches = await db.branch.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true },
  });
  const branchIds = branches.map((b: { id: string }) => b.id);
  if (branchParam && !branchIds.includes(branchParam)) {
    return ctx.json({ message: 'Unknown branch.' }, 422);
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        stockLevels: {
          where: { branchId: { in: branchParam ? [branchParam] : branchIds } },
          select: { branchId: true, quantity: true },
        },
      },
      orderBy: { name: 'asc' },
      skip,
      take: perPage,
    }),
    db.product.count({ where }),
  ]);

  const branchName = new Map(branches.map((b: { id: string; name: string }) => [b.id, b.name]));

  const data = products.map((p: typeof products[number]) => {
    const levels = p.stockLevels as { branchId: string; quantity: number }[];
    const onHand = levels.reduce((sum, sl) => sum + sl.quantity, 0);
    // Low stock is judged per branch: in the one-branch view on that
    // branch's quantity (no row yet = 0), in the all-branches view if ANY
    // branch holding the product is at or under the threshold.
    const lowStock =
      p.trackStock &&
      (branchParam || levels.length === 0
        ? onHand <= p.lowStockThreshold
        : levels.some((sl) => sl.quantity <= p.lowStockThreshold));
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      barcode: p.barcode,
      priceCents: p.priceCents,
      category: p.category?.name ?? null,
      onHand,
      byBranch: levels.map((sl) => ({ branchId: sl.branchId, branch: branchName.get(sl.branchId) ?? '', qty: sl.quantity })),
      tracked: p.trackStock,
      lowStock,
    };
  });

  return ctx.json({ data, total, page, perPage, branches, filters: { q: search, branchId: branchParam } });
});

// GET /products/categories (for create form)
productRoutes.get('/form-data', async (ctx) => {
  const tenant = ctx.get('tenant');
  const categories = await db.category.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const branch = await defaultBranch(tenant.id);
  const type = businessTypeFor(tenant.mode, branch?.mode);
  return ctx.json({
    // `trackStock`: whether a new product in this category should start with
    // stock tracking on — off for services and cooked dishes (see isUnstockedCategory).
    categories: categories.map((c: { id: string; name: string }) => ({ ...c, trackStock: !isUnstockedCategory(type, c.name) })),
  });
});

// GET /products/suggestions — this business type's ready-made products the
// business doesn't have yet (a butchery with only "Beef" is offered Chicken,
// Pork, Goat, Boerewors…). Previously the ready-made set could only be loaded
// into a completely EMPTY catalogue, so after the first product it vanished.
productRoutes.get('/suggestions', async (ctx) => {
  const { type, missing } = await missingStarters(ctx.get('tenant'));
  return ctx.json({
    businessType: type.label,
    suggestions: missing.map((s) => ({ name: s.name, category: s.category, priceCents: s.priceCents, tracked: s.qty !== null })),
  });
});

// POST /products/suggestions { items: [{ name, priceCents? }] } — add some (or
// all) of them, optionally at the owner's own price. Only names from the
// suggestion list are accepted — this isn't a bulk-create API. Added with NO
// opening stock (see addStarters): receive the real quantity afterwards.
productRoutes.post('/suggestions', async (ctx) => {
  const user = ctx.get('user');
  if (!isAdmin(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const tenant = ctx.get('tenant');

  const { items } = z
    .object({
      items: z.array(z.object({ name: z.string(), priceCents: z.number().int().min(0).max(100_000_000).optional() })).min(1).max(50),
    })
    .parse(await ctx.req.json());

  const { missing, branch } = await missingStarters(tenant);
  if (!branch) return ctx.json({ message: 'No branch found.' }, 422);

  const byName = new Map(missing.map((s) => [s.name, s]));
  const seen = new Set<string>();
  const chosen: { starter: (typeof missing)[number]; priceCents?: number }[] = [];
  for (const i of items) {
    const starter = byName.get(i.name);
    if (!starter || seen.has(i.name)) continue; // unknown, already added, or repeated in the request
    seen.add(i.name);
    chosen.push({ starter, priceCents: i.priceCents });
  }
  await addStarters(tenant, branch, chosen, { openingStock: false });

  const n = chosen.length;
  return ctx.json({
    added: chosen.map((c) => c.starter.name),
    message: n ? `Added ${n} product${n === 1 ? '' : 's'}. Use Restock (or Receive stock at the till) to set how many you have.` : 'Nothing to add.',
  }, 201);
});

// POST /products
productRoutes.post('/', async (ctx) => {
  const user = ctx.get('user');
  if (!isAdmin(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const body = await ctx.req.json();
  const data = z.object({
    name: z.string().min(1),
    categoryId: z.string().uuid().nullable().optional(),
    barcode: z.string().nullable().optional(),
    priceCents: z.number().int().min(0),
    costCents: z.number().int().min(0).nullable().optional(),
    taxClass: z.string().default('standard'),
    type: z.enum(['retail', 'restaurant']).default('retail'),
    trackStock: z.boolean().default(true),
    initialQty: z.number().int().min(0).default(0),
    // Which branch the opening stock lands on. Optional: omitted means the
    // default branch (single-branch tenants never see a choice).
    branchId: z.string().uuid().nullable().optional(),
    brand: z.string().nullable().optional(),
  }).parse(body);

  // Resolve the stock branch BEFORE creating anything: previously a missing
  // branch silently dropped the opening quantity after the product existed.
  const stockBranch = data.trackStock && data.initialQty > 0
    ? await (data.branchId
        ? db.branch.findFirst({ where: { id: data.branchId, tenantId: tenant.id, deletedAt: null } })
        : db.branch.findFirst({
            where: { tenantId: tenant.id, deletedAt: null },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          }))
    : null;
  if (data.trackStock && data.initialQty > 0 && !stockBranch) {
    return ctx.json({ errors: { branchId: 'Choose a branch for the opening stock.' } }, 422);
  }

  // Generate next SKU atomically
  const updatedTenant = await db.tenant.update({
    where: { id: tenant.id },
    data: { nextSkuNumber: { increment: 1 } },
    select: { nextSkuNumber: true },
  });
  const sku = `SKU-${String(updatedTenant.nextSkuNumber - 1).padStart(6, '0')}`;

  const product = await db.product.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      categoryId: data.categoryId ?? null,
      sku,
      barcode: data.barcode ?? null,
      name: data.name,
      brand: data.brand ?? null,
      priceCents: data.priceCents,
      costCents: data.costCents ?? null,
      taxClass: data.taxClass,
      type: data.type,
      trackStock: data.trackStock,
    },
  });

  // Record initial stock movement if needed
  if (stockBranch) {
    await db.$transaction([
      db.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          branchId: stockBranch.id,
          productId: product.id,
          delta: data.initialQty,
          reason: 'initial',
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      }),
      db.stockLevel.upsert({
        where: { branchId_productId: { branchId: stockBranch.id, productId: product.id } },
        create: { tenantId: tenant.id, branchId: stockBranch.id, productId: product.id, quantity: data.initialQty, updatedAt: new Date() },
        update: { quantity: { increment: data.initialQty }, updatedAt: new Date() },
      }),
    ]);
  }

  // Was `sku: product.name` — the response's `sku` field held the product's
  // name instead of its actual SKU. Harmless today (Create.tsx doesn't read
  // it), but the api.ts type declares this as the real SKU, so any future
  // consumer (a "created SKU-000042" toast, an integration) would get the
  // wrong value.
  const stockNote = stockBranch ? ` ${data.initialQty} in stock at ${stockBranch.name}.` : '';
  return ctx.json({ id: product.id, sku, message: `Added ${product.name} (SKU ${sku}).${stockNote}` }, 201);
});

// DELETE /products/:id
productRoutes.delete('/:id', async (ctx) => {
  const user = ctx.get('user');
  if (!isAdmin(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const product = await db.product.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id } });
  if (!product) return ctx.json({ message: 'Not found.' }, 404);

  await db.product.update({ where: { id: product.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: 'Product removed.' });
});

// POST /products/:id/count — stock take: "there are N on the shelf at this branch"
//
// Restock can only ADD, so a level that's wrong the other way (negative after
// an oversell, or shrinkage/breakage) had no honest fix. This sets the level
// to what was physically counted and records the difference as an
// 'adjustment' movement, so the ledger still sums to the level and the
// correction is visible in the stock history rather than silently overwritten.
productRoutes.post('/:id/count', async (ctx) => {
  const user = ctx.get('user');
  if (!isAdmin(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const { counted, branchId } = z
    .object({ counted: z.number().int().min(0), branchId: z.string().uuid().optional() })
    .parse(await ctx.req.json());

  const product = await db.product.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null } });
  if (!product) return ctx.json({ message: 'Not found.' }, 404);
  if (!product.trackStock) return ctx.json({ message: 'This product does not track stock.' }, 422);

  const branch = branchId
    ? await db.branch.findFirst({ where: { id: branchId, tenantId: tenant.id, deletedAt: null } })
    : await db.branch.findFirst({
        where: { tenantId: tenant.id, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
  if (!branch) return ctx.json({ message: 'No branch found.' }, 422);

  // The delta is computed from the level INSIDE the transaction, with the
  // row locked (SELECT … FOR UPDATE), so a sale syncing at the same moment
  // can't be lost between reading the old level and writing the new one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { before, delta } = await (db.$transaction as any)(async (tx: typeof db) => {
    const rows = await tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity FROM stock_levels
      WHERE branch_id = ${branch.id}::uuid AND product_id = ${product.id}::uuid
      FOR UPDATE`;
    const current = rows[0]?.quantity ?? 0;
    const diff = counted - current;
    if (diff !== 0) {
      await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          branchId: branch.id,
          productId: product.id,
          delta: diff,
          reason: 'adjustment',
          ref: `count:${user.id}`,
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      });
      await tx.stockLevel.upsert({
        where: { branchId_productId: { branchId: branch.id, productId: product.id } },
        create: { tenantId: tenant.id, branchId: branch.id, productId: product.id, quantity: counted, updatedAt: new Date() },
        update: { quantity: counted, updatedAt: new Date() },
      });
    }
    return { before: current, delta: diff };
  }, { timeout: 30_000 });

  const change = delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${delta}`;
  return ctx.json({
    message: `${product.name} at ${branch.name}: was ${before}, counted ${counted} (${change}).`,
    before,
    counted,
    delta,
  });
});

// POST /products/:id/tracking { trackStock } — turn stock tracking off for a
// product that never had any stock to count (a service added with "Track stock"
// left ticked), or on for one that should have it.
//
// Nothing is deleted: the stock ledger and levels stay as they are. Tracking off
// makes every till stop counting it (no "in stock" label, no out-of-stock block,
// no stock movement on a sale), and a sale rung up offline before the till heard
// about the change has its movement ignored on sync (syncService only applies
// movements for tracked products). Tracking on starts from whatever level is
// recorded — a stock count sets it to the real number. Products.updatedAt moves,
// so every till picks the change up on its next pull.
productRoutes.post('/:id/tracking', async (ctx) => {
  const user = ctx.get('user');
  if (!isAdmin(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const { trackStock } = z.object({ trackStock: z.boolean() }).parse(await ctx.req.json());

  const product = await db.product.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null } });
  if (!product) return ctx.json({ message: 'Not found.' }, 404);
  if (product.trackStock === trackStock) {
    return ctx.json({ message: `${product.name} already ${trackStock ? 'tracks' : "doesn't track"} stock.` });
  }

  await db.product.update({ where: { id: product.id }, data: { trackStock } });

  return ctx.json({
    message: trackStock
      ? `${product.name} now tracks stock. Use Count to set how many there are.`
      : `${product.name} no longer tracks stock.`,
  });
});

// POST /products/:id/restock
productRoutes.post('/:id/restock', async (ctx) => {
  const user = ctx.get('user');
  if (!isAdmin(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const body = await ctx.req.json();
  // branchId is optional: single-branch tenants (the common case) keep
  // working exactly as before with no UI change required. Multi-branch
  // tenants can now pass one explicitly instead of every restock silently
  // landing on whichever branch sorts first.
  const { qty, branchId } = z
    .object({ qty: z.number().int().min(1), branchId: z.string().uuid().optional() })
    .parse(body);

  const product = await db.product.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null } });
  if (!product) return ctx.json({ message: 'Not found.' }, 404);
  if (!product.trackStock) return ctx.json({ message: 'This product does not track stock.' }, 422);

  const branch = branchId
    ? await db.branch.findFirst({ where: { id: branchId, tenantId: tenant.id, deletedAt: null } })
    : await db.branch.findFirst({
        where: { tenantId: tenant.id, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
  if (!branch) return ctx.json({ message: 'No branch found.' }, 422);

  await db.$transaction([
    db.stockMovement.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        branchId: branch.id,
        productId: product.id,
        delta: qty,
        reason: 'purchase',
        occurredAt: new Date(),
        createdAt: new Date(),
      },
    }),
    db.stockLevel.upsert({
      where: { branchId_productId: { branchId: branch.id, productId: product.id } },
      create: { tenantId: tenant.id, branchId: branch.id, productId: product.id, quantity: qty, updatedAt: new Date() },
      update: { quantity: { increment: qty }, updatedAt: new Date() },
    }),
  ]);

  const level = await db.stockLevel.findUnique({
    where: { branchId_productId: { branchId: branch.id, productId: product.id } },
  });

  return ctx.json({
    message: `Added ${qty} to ${product.name} at ${branch.name}. On hand: ${level?.quantity ?? qty}.`,
  });
});
