/**
 * Adding a business type's ready-made products (domain/businessTypes.ts) to a
 * tenant's catalogue — shared by the "Get selling" example set for a brand-new
 * business and the Products page's "Suggested for <your business>" list, so
 * both create products the same way (SKU scheme, categories, stock ledger).
 */
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { businessTypeFor, type BusinessType, type Starter } from './businessTypes.js';

export interface TenantLite {
  id: string;
  mode: string | null;
  currency?: string | null;
}
export interface BranchLite {
  id: string;
  mode: string;
}

export async function defaultBranch(tenantId: string): Promise<BranchLite | null> {
  return db.branch.findFirst({
    where: { tenantId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, mode: true },
  });
}

/**
 * This business type's ready-made products the business doesn't have yet,
 * compared by name ignoring case — so a butchery that has "Beef" is still
 * offered Chicken, Pork, Goat and the rest, and never offered something twice.
 */
export async function missingStarters(
  tenant: TenantLite,
): Promise<{ type: BusinessType; branch: BranchLite | null; missing: Starter[] }> {
  const [branch, existing] = await Promise.all([
    defaultBranch(tenant.id),
    db.product.findMany({ where: { tenantId: tenant.id, deletedAt: null }, select: { name: true } }),
  ]);
  const type = businessTypeFor(tenant.mode, branch?.mode);
  const have = new Set(existing.map((p: { name: string }) => p.name.trim().toLowerCase()));
  return { type, branch, missing: type.starters.filter((s) => !have.has(s.name.toLowerCase())) };
}

/**
 * Creates the chosen products (and any of their categories that don't exist
 * yet) in one transaction. `priceCents` overrides the example price.
 *
 * `openingStock`: a brand-new business gets the example quantities so it can
 * ring up a sale straight away. Products added to a real, running catalogue
 * get NONE — inventing stock would put made-up numbers into the ledger; the
 * owner receives the real quantity (Receive stock / Products → Restock).
 */
export async function addStarters(
  tenant: TenantLite,
  branch: BranchLite,
  items: { starter: Starter; priceCents?: number }[],
  opts: { openingStock: boolean },
): Promise<number> {
  if (items.length === 0) return 0;
  const productType = branch.mode === 'restaurant' ? 'restaurant' : 'retail';

  // Reserve a block of SKU numbers in one atomic increment (same SKU-000001
  // scheme as POST /products).
  const { nextSkuNumber } = await db.tenant.update({
    where: { id: tenant.id },
    data: { nextSkuNumber: { increment: items.length } },
    select: { nextSkuNumber: true },
  });
  const firstSku = nextSkuNumber - items.length;
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.$transaction as any)(async (tx: typeof db) => {
    const categoryIds = new Map<string, string>();
    for (const name of new Set(items.map((i) => i.starter.category))) {
      const existing = await tx.category.findFirst({
        where: { tenantId: tenant.id, name, deletedAt: null },
        select: { id: true },
      });
      categoryIds.set(
        name,
        existing?.id ?? (await tx.category.create({ data: { tenantId: tenant.id, name }, select: { id: true } })).id,
      );
    }

    for (const [i, { starter, priceCents }] of items.entries()) {
      const productId = crypto.randomUUID();
      await tx.product.create({
        data: {
          id: productId,
          tenantId: tenant.id,
          categoryId: categoryIds.get(starter.category) ?? null,
          sku: `SKU-${String(firstSku + i).padStart(6, '0')}`,
          name: starter.name,
          priceCents: priceCents ?? starter.priceCents,
          currency: tenant.currency ?? 'USD',
          type: productType,
          trackStock: starter.qty !== null,
        },
      });
      if (opts.openingStock && starter.qty !== null && starter.qty > 0) {
        // Through the ledger like any other opening stock (POST /products).
        await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(), tenantId: tenant.id, branchId: branch.id, productId,
            delta: starter.qty, reason: 'initial', occurredAt: now, createdAt: now,
          },
        });
        await tx.stockLevel.create({
          data: { tenantId: tenant.id, branchId: branch.id, productId, quantity: starter.qty, updatedAt: now },
        });
      }
    }
  }, { timeout: 30_000 });

  return items.length;
}
