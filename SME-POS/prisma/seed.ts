/**
 * Dev seed script — port of _laravel-archive/database/seeders/DatabaseSeeder.php
 *
 * Creates one demo merchant you can actually log into, then fills its
 * catalogue so the dashboard isn't a wall of empty states.
 *
 * Unlike the Laravel version, this does NOT run through the real
 * "RegisterTenant"/"StockService" domain classes — porting that indirection
 * faithfully would mean importing route-layer code into a seed script, which
 * Prisma's seed runner isn't set up for here. Instead this writes the same
 * rows those code paths would produce, using the exact hashing/field
 * conventions the routes use (bcrypt cost 10 for PINs, cost 12 for
 * passwords, SHA-256 for device tokens — see routes/staff.ts, routes/devices.ts).
 * If those conventions ever change, this file needs to change with them.
 *
 * Re-runnable: skips if the demo tenant already exists.
 * Rebuild from scratch: delete the "demo" tenant row (cascades), then re-run.
 *
 * Run with: npx prisma db seed   (wired via package.json's "prisma.seed" key)
 */
import { db } from '../server/src/lib/db.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// Reuses the exact same singleton (with its Postgres driver adapter — see
// server/src/lib/db.ts's docblock) that the API server itself uses. Prisma
// v7 requires an adapter and this project generates the client to a custom
// path (server/src/generated/prisma), so a bare `new PrismaClient()` here
// — the usual seed-script boilerplate — would not work.

const SUBDOMAIN = 'demo';
const OWNER_EMAIL = 'owner@demo.test';
const OWNER_PASSWORD = 'password';
const MANAGER_EMAIL = 'manager@demo.test';
const MANAGER_PASSWORD = 'password';
const DEVICE_TOKEN = 'demo-device-token'; // fixed in dev so the PWA can authenticate without provisioning
const CASHIER_PIN = '1234';
// Owner/manager till PINs — without one they never reach the till (bootstrap
// only ships staff with a pinHash), so owner/manager-only till actions like
// Receive stock and Record payment would be unreachable in the demo.
const OWNER_PIN = '0000';
const MANAGER_PIN = '5678';

async function main() {
  const existing = await db.tenant.findUnique({ where: { subdomain: SUBDOMAIN } });
  if (existing) {
    console.log('Demo tenant already exists — skipping. Delete it and re-run to rebuild.');
    return;
  }

  const tenantId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();

  // 15% VAT, matching the reference receipts, so the inclusive-VAT breakdown
  // (Net / VAT / Total) is exercised out of the box instead of sitting
  // dormant at the 0% default (ARCHITECTURE.md §3).
  const tenant = await db.tenant.create({
    data: {
      id: tenantId,
      name: 'Demo Store',
      subdomain: SUBDOMAIN,
      plan: 'standard',
      status: 'active',
      taxRateBps: 1500,
    },
  });

  const branch = await db.branch.create({
    data: { id: branchId, tenantId, name: 'Main Branch', isDefault: true },
  });

  await db.user.create({
    data: {
      id: ownerId,
      tenantId,
      branchId,
      name: 'Demo Owner',
      email: OWNER_EMAIL,
      password: await bcrypt.hash(OWNER_PASSWORD, 12),
      pinHash: await bcrypt.hash(OWNER_PIN, 10),
      role: 'owner',
    },
  });

  await seedCatalogue(tenantId, branchId);
  await seedDevice(tenantId, branchId);
  await seedStaff(tenantId, branchId);
  await seedTables(tenantId, branchId);
  await seedTasks(tenantId, branchId);

  report(tenant.subdomain);
}

/**
 * Opening stock is written the same way a real purchase/restock would be —
 * a StockMovement row (reason "initial") plus the StockLevel cache — not a
 * bare quantity, so the seeded data exercises the ledger like everything
 * else does (ARCHITECTURE.md §5.1).
 */
async function seedCatalogue(tenantId: string, branchId: string) {
  // name, price in DOLLARS, category, opening quantity
  const catalogue: [string, number, string, number][] = [
    ['Bread (loaf)', 1.20, 'Groceries', 40],
    ['Sugar 2kg', 2.50, 'Groceries', 25],
    ['Cooking Oil 2L', 3.80, 'Groceries', 18],
    ['Mealie Meal 10kg', 7.50, 'Groceries', 12],
    ['Mazoe Orange 2L', 4.00, 'Beverages', 30],
    ['Bottled Water 500ml', 0.50, 'Beverages', 120],
    ['Dishwashing Liquid', 1.90, 'Household', 22],
    ['Bath Soap', 0.80, 'Household', 60],
  ];

  const categoryIds = new Map<string, string>();
  let sku = 1000;

  for (const [name, price, categoryName, qty] of catalogue) {
    if (!categoryIds.has(categoryName)) {
      const category = await db.category.create({ data: { tenantId, name: categoryName } });
      categoryIds.set(categoryName, category.id);
    }

    const product = await db.product.create({
      data: {
        tenantId,
        categoryId: categoryIds.get(categoryName)!,
        sku: `SKU-${sku++}`,
        name,
        priceCents: Math.round(price * 100),
        type: 'retail',
        trackStock: true,
      },
    });

    await db.stockMovement.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        branchId,
        productId: product.id,
        delta: qty,
        reason: 'initial',
        occurredAt: new Date(),
        createdAt: new Date(),
      },
    });
    await db.stockLevel.create({
      data: { tenantId, branchId, productId: product.id, quantity: qty, updatedAt: new Date() },
    });
  }
}

async function seedDevice(tenantId: string, branchId: string) {
  await db.device.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      branchId,
      name: 'Front Counter',
      tokenHash: crypto.createHash('sha256').update(DEVICE_TOKEN).digest('hex'),
    },
  });
}

/**
 * A cashier with a till PIN (till-only, no dashboard login) and a manager
 * with dashboard login (email/password, no PIN) — exercising both account
 * shapes out of the box, same split as staff.ts's isDashboard branch.
 */
async function seedStaff(tenantId: string, branchId: string) {
  await db.user.create({
    data: {
      tenantId,
      branchId,
      name: 'Tariro',
      email: `tariro+${crypto.randomUUID().slice(0, 8)}@demo.test`, // (tenantId,email) is unique — cashiers still need a placeholder
      password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12), // never used to log in
      role: 'cashier',
      pinHash: await bcrypt.hash(CASHIER_PIN, 10),
    },
  });

  await db.user.create({
    data: {
      tenantId,
      branchId,
      name: 'Grace (Manager)',
      email: MANAGER_EMAIL,
      password: await bcrypt.hash(MANAGER_PASSWORD, 12),
      pinHash: await bcrypt.hash(MANAGER_PIN, 10),
      role: 'manager',
    },
  });
}

/** A small floor plan. Only shown in restaurant mode, harmless to seed for retail. */
async function seedTables(tenantId: string, branchId: string) {
  const tables: [string, string, number][] = [
    ['T1', 'Main', 2], ['T2', 'Main', 4], ['T3', 'Main', 4], ['T4', 'Main', 6],
    ['P1', 'Patio', 2], ['P2', 'Patio', 2], ['P3', 'Patio', 4],
  ];

  for (let i = 0; i < tables.length; i++) {
    const [name, section, seats] = tables[i];
    await db.restaurantTable.create({
      data: { tenantId, branchId, name, section, seats, sort: i },
    });
  }
}

/** A few demo tasks so the checklist has something to click through immediately. */
async function seedTasks(tenantId: string, branchId: string) {
  const cashier = await db.user.findFirst({ where: { tenantId, name: 'Tariro' } });

  await db.task.create({
    data: { tenantId, branchId, title: 'Count the till at open', assignedTo: cashier?.id ?? null },
  });
  await db.task.create({
    data: { tenantId, branchId, title: 'Restock fridge — Coca-Cola and Mazoe' },
  });
  await db.task.create({
    data: {
      tenantId, branchId,
      title: 'Wipe down counters and clean floor',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

function report(subdomain: string) {
  const domain = process.env.TENANT_DOMAIN ?? 'wivae.test';
  const host = `${subdomain}.${domain}`;

  console.log('');
  console.log('Demo tenant ready.');
  console.log(`  URL:              http://${host}/login`);
  console.log(`  Email:            ${OWNER_EMAIL}`);
  console.log(`  Password:         ${OWNER_PASSWORD}`);
  console.log(`  Device token (POS): ${DEVICE_TOKEN}`);
  console.log(`  Cashier PIN (till): ${CASHIER_PIN}`);
  console.log(`  Manager login:    ${MANAGER_EMAIL} / ${MANAGER_PASSWORD}`);
  console.log('  3 demo tasks seeded (dashboard: /tasks, till: Tasks button)');
  console.log(`  Till URL:         http://${host}/pos`);
  console.log('  VAT rate:         15% (inclusive — Settings → General to change)');
  console.log(`  (add '127.0.0.1 ${host}' to your hosts file if you haven't)`);
  console.log('');
  console.log('  Restaurant mode (tables + kitchen at /kitchen): set the demo');
  console.log("  branch's mode to 'restaurant' directly in the DB, e.g. via psql:");
  console.log(`    update branches set mode = 'restaurant' where tenant_id = (select id from tenants where subdomain = '${subdomain}');`);
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
