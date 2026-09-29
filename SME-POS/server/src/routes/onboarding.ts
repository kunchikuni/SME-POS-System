/**
 * "Get selling" — the dashboard checklist that takes a brand-new business
 * from sign-up to its first sale:
 *
 *   1. Products     — add their own, import a CSV, or load a starter set
 *   2. Till         — one click creates a device and opens the paired till
 *   3. First sale   — ring something up; ticks itself off once it syncs
 *
 * Every step's state is derived from real data (product/device/sale
 * counts), never stored as a flag, so it can't drift from reality — e.g.
 * deleting every device reopens step 2.
 */
import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
import { businessTypeFor } from '../domain/businessTypes.js';

export const onboardingRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);

// GET /onboarding
onboardingRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const [products, devices, sales, branch] = await Promise.all([
    db.product.count({ where: { tenantId: t.id, deletedAt: null } }),
    db.device.count({ where: { tenantId: t.id, deletedAt: null } }),
    db.sale.count({ where: { tenantId: t.id, deletedAt: null } }),
    db.branch.findFirst({
      where: { tenantId: t.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { mode: true },
    }),
  ]);
  const type = businessTypeFor(t.mode, branch?.mode);
  return ctx.json({
    mode: branch?.mode ?? 'retail',
    businessType: { key: type.key, label: type.label },
    steps: { products: products > 0, till: devices > 0, sale: sales > 0 },
    counts: { products, devices, sales },
  });
});

// POST /onboarding/starter-products — only into an EMPTY catalogue, so it can
// never duplicate or mix with a real one (e.g. a double-click, or pressing it
// after importing a CSV).
onboardingRoutes.post('/starter-products', async (ctx) => {
  const u = ctx.get('user');
  if (!ADMIN_ROLES.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const t = ctx.get('tenant');

  if ((await db.product.count({ where: { tenantId: t.id, deletedAt: null } })) > 0) {
    return ctx.json({ message: 'You already have products — the starter set is only for an empty catalogue.' }, 422);
  }
  const branch = await db.branch.findFirst({
    where: { tenantId: t.id, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (!branch) return ctx.json({ message: 'No branch found.' }, 422);

  // Example products for this business type (domain/businessTypes.ts) — a
  // pharmacy gets medicines, a bottle store gets drinks, not a tuckshop's list.
  const items = businessTypeFor(t.mode, branch.mode).starters;
  const productType = branch.mode === 'restaurant' ? 'restaurant' : 'retail';

  // Reserve a block of SKU numbers in one atomic increment (same SKU-000001
  // scheme as POST /products).
  const { nextSkuNumber } = await db.tenant.update({
    where: { id: t.id },
    data: { nextSkuNumber: { increment: items.length } },
    select: { nextSkuNumber: true },
  });
  const firstSku = nextSkuNumber - items.length;
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.$transaction as any)(async (tx: typeof db) => {
    const categoryIds = new Map<string, string>();
    for (const name of new Set(items.map((i) => i.category))) {
      const existing = await tx.category.findFirst({ where: { tenantId: t.id, name, deletedAt: null }, select: { id: true } });
      categoryIds.set(name, existing?.id ?? (await tx.category.create({ data: { tenantId: t.id, name }, select: { id: true } })).id);
    }

    for (const [i, item] of items.entries()) {
      const productId = crypto.randomUUID();
      await tx.product.create({
        data: {
          id: productId,
          tenantId: t.id,
          categoryId: categoryIds.get(item.category) ?? null,
          sku: `SKU-${String(firstSku + i).padStart(6, '0')}`,
          name: item.name,
          priceCents: item.priceCents,
          currency: t.currency ?? 'USD',
          type: productType,
          trackStock: item.qty !== null,
        },
      });
      if (item.qty !== null) {
        // Through the ledger like any other opening stock (POST /products).
        await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(), tenantId: t.id, branchId: branch.id, productId,
            delta: item.qty, reason: 'initial', occurredAt: now, createdAt: now,
          },
        });
        await tx.stockLevel.create({
          data: { tenantId: t.id, branchId: branch.id, productId, quantity: item.qty, updatedAt: now },
        });
      }
    }
  }, { timeout: 30_000 });

  return ctx.json({ message: `Added ${items.length} example products. Edit or delete them any time under Inventory.`, count: items.length }, 201);
});

// POST /onboarding/till — create a device for THIS browser and hand back its
// token, so the dashboard can open the till already paired (the token goes
// in the URL fragment, which browsers never send to a server or log).
onboardingRoutes.post('/till', async (ctx) => {
  const u = ctx.get('user');
  if (!ADMIN_ROLES.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const t = ctx.get('tenant');

  const branch = await db.branch.findFirst({
    where: { tenantId: t.id, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true },
  });
  if (!branch) return ctx.json({ message: 'No branch found.' }, 422);

  const count = await db.device.count({ where: { tenantId: t.id, deletedAt: null } });
  // Same token scheme as POST /devices: random, returned once, stored only hashed.
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const device = await db.device.create({
    data: { id: crypto.randomUUID(), tenantId: t.id, branchId: branch.id, name: `Till ${count + 1}`, tokenHash },
  });

  return ctx.json({ id: device.id, name: device.name, branch: branch.name, token }, 201);
});
