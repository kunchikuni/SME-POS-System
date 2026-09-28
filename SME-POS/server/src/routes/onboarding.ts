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
  return ctx.json({
    mode: branch?.mode ?? 'retail',
    steps: { products: products > 0, till: devices > 0, sale: sales > 0 },
    counts: { products, devices, sales },
  });
});

// ── Starter catalogues ───────────────────────────────────────────────────────
// Typical items for each business type, so a new owner can ring up a real-
// looking sale in the first minute and then edit or delete them. Prices in
// USD cents; `qty` is opening stock (null = doesn't track stock, e.g. a
// cooked dish or labour).
type Starter = { name: string; category: string; priceCents: number; qty: number | null };

const STARTERS: Record<string, Starter[]> = {
  retail: [
    { name: 'Bread (loaf)', category: 'Groceries', priceCents: 100, qty: 30 },
    { name: 'Cooking Oil 2L', category: 'Groceries', priceCents: 380, qty: 20 },
    { name: 'Sugar 2kg', category: 'Groceries', priceCents: 250, qty: 20 },
    { name: 'Mealie Meal 10kg', category: 'Groceries', priceCents: 700, qty: 15 },
    { name: 'Rice 2kg', category: 'Groceries', priceCents: 220, qty: 20 },
    { name: 'Coke 500ml', category: 'Drinks', priceCents: 80, qty: 48 },
    { name: 'Milk 1L', category: 'Drinks', priceCents: 110, qty: 24 },
    { name: 'Bath Soap', category: 'Toiletries', priceCents: 60, qty: 40 },
  ],
  restaurant: [
    { name: 'Sadza & Beef Stew', category: 'Mains', priceCents: 500, qty: null },
    { name: 'Chicken & Chips', category: 'Mains', priceCents: 600, qty: null },
    { name: 'Beef Burger', category: 'Mains', priceCents: 550, qty: null },
    { name: 'Garden Salad', category: 'Sides', priceCents: 300, qty: null },
    { name: 'Coke 330ml', category: 'Cold drinks', priceCents: 100, qty: 48 },
    { name: 'Water 500ml', category: 'Cold drinks', priceCents: 80, qty: 48 },
    { name: 'Tea', category: 'Hot drinks', priceCents: 100, qty: null },
    { name: 'Coffee', category: 'Hot drinks', priceCents: 150, qty: null },
  ],
  hardware: [
    { name: 'Cement 50kg', category: 'Building', priceCents: 1200, qty: 40 },
    { name: 'Wire Nails 1kg', category: 'Fasteners', priceCents: 250, qty: 30 },
    { name: 'PVA Paint 5L', category: 'Paint', priceCents: 1800, qty: 12 },
    { name: 'PVC Pipe 50mm (6m)', category: 'Plumbing', priceCents: 900, qty: 20 },
    { name: 'Padlock 50mm', category: 'Security', priceCents: 500, qty: 15 },
    { name: 'Claw Hammer', category: 'Tools', priceCents: 800, qty: 10 },
    { name: 'Wheelbarrow', category: 'Tools', priceCents: 4500, qty: 5 },
    { name: 'Electrical Cable 2.5mm (per m)', category: 'Electrical', priceCents: 80, qty: 200 },
  ],
  workshop: [
    { name: 'Labour (1 hour)', category: 'Services', priceCents: 1500, qty: null },
    { name: 'Oil Change Service', category: 'Services', priceCents: 2500, qty: null },
    { name: 'Wheel Balancing', category: 'Services', priceCents: 800, qty: null },
    { name: 'Diagnostics', category: 'Services', priceCents: 1000, qty: null },
    { name: 'Engine Oil 5L', category: 'Parts', priceCents: 2200, qty: 12 },
    { name: 'Oil Filter', category: 'Parts', priceCents: 600, qty: 20 },
    { name: 'Brake Pads (set)', category: 'Parts', priceCents: 1800, qty: 10 },
    { name: 'Spark Plug', category: 'Parts', priceCents: 300, qty: 40 },
  ],
};

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

  const items = STARTERS[branch.mode] ?? STARTERS.retail;
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
