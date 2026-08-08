/** Products routes — port of ProductController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';

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

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { category: { select: { name: true } }, stockLevels: { select: { quantity: true } } },
      orderBy: { name: 'asc' },
      skip,
      take: perPage,
    }),
    db.product.count({ where }),
  ]);

  const data = products.map((p: typeof products[number]) => {
    const onHand = p.stockLevels.reduce((sum: number, sl: { quantity: number }) => sum + sl.quantity, 0);
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      barcode: p.barcode,
      priceCents: p.priceCents,
      category: p.category?.name ?? null,
      onHand,
      tracked: p.trackStock,
      lowStock: p.trackStock && onHand <= p.lowStockThreshold,
    };
  });

  return ctx.json({ data, total, page, perPage, filters: { q: search } });
});

// GET /products/categories (for create form)
productRoutes.get('/form-data', async (ctx) => {
  const tenant = ctx.get('tenant');
  const categories = await db.category.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return ctx.json({ categories });
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
    brand: z.string().nullable().optional(),
  }).parse(body);

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
  if (product.trackStock && data.initialQty > 0) {
    const defaultBranch = await db.branch.findFirst({
      where: { tenantId: tenant.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (defaultBranch) {
      await db.$transaction([
        db.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            branchId: defaultBranch.id,
            productId: product.id,
            delta: data.initialQty,
            reason: 'initial',
            occurredAt: new Date(),
            createdAt: new Date(),
          },
        }),
        db.stockLevel.upsert({
          where: { branchId_productId: { branchId: defaultBranch.id, productId: product.id } },
          create: { tenantId: tenant.id, branchId: defaultBranch.id, productId: product.id, quantity: data.initialQty, updatedAt: new Date() },
          update: { quantity: { increment: data.initialQty }, updatedAt: new Date() },
        }),
      ]);
    }
  }

  // Was `sku: product.name` — the response's `sku` field held the product's
  // name instead of its actual SKU. Harmless today (Create.tsx doesn't read
  // it), but the api.ts type declares this as the real SKU, so any future
  // consumer (a "created SKU-000042" toast, an integration) would get the
  // wrong value.
  return ctx.json({ id: product.id, sku, message: `Added ${product.name} (SKU ${sku}).` }, 201);
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
