/**
 * Credit customers — the dashboard's view of who owes what.
 *
 * Customers are created at the till (the first credit sale for a new name
 * upserts them — syncService.applySale), and tills record repayments offline
 * (debt.repay → applyDebtRepayment). This is the owner's side: the debtor
 * list, each customer's statement, recording a payment received at the
 * office, and correcting a name or phone.
 *
 * balanceCents is a cache, the same ledger-plus-cache pattern as stock:
 *   balance = Σ credit on completed sales − Σ CustomerPayment
 * so every change here goes through a CustomerPayment row (never a bare edit
 * of the balance), keeping the statement and the balance in agreement.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';

export const customerRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);
/** Tenders a repayment can arrive in — never 'credit' (you can't repay debt with more debt). */
const REPAY_METHODS = ['cash', 'ecocash', 'innbucks', 'omari', 'onemoney', 'zipit', 'other'] as const;

// GET /customers?q= — debtor list, biggest balance first
customerRoutes.get('/', async (ctx) => {
  const tenant = ctx.get('tenant');
  const q = ctx.req.query('q')?.trim() ?? '';

  const customers = await db.customer.findMany({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      ...(q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }
        : {}),
    },
    orderBy: [{ balanceCents: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, phone: true, balanceCents: true, updatedAt: true },
  });

  const totalOwedCents = customers.reduce(
    (sum: number, c: { balanceCents: number }) => sum + Math.max(0, c.balanceCents),
    0,
  );
  return ctx.json({ customers, totalOwedCents });
});

// GET /customers/:id — statement: credit sales and payments, newest first
customerRoutes.get('/:id', async (ctx) => {
  const tenant = ctx.get('tenant');
  const customer = await db.customer.findFirst({
    where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true, phone: true, balanceCents: true, createdAt: true },
  });
  if (!customer) return ctx.json({ message: 'Not found.' }, 404);

  const [sales, payments] = await Promise.all([
    db.sale.findMany({
      where: { tenantId: tenant.id, customerId: customer.id, deletedAt: null },
      orderBy: { occurredAt: 'desc' },
      take: 100,
      select: {
        id: true,
        occurredAt: true,
        status: true,
        totalCents: true,
        branch: { select: { name: true } },
        payments: { where: { method: 'credit' }, select: { amountCents: true } },
        // What they took on account — the name/price are the ones captured
        // at the till when sold, so a later rename or price change doesn't
        // rewrite the customer's history.
        lines: { select: { name: true, qty: true, unitPriceCents: true, lineTotalCents: true } },
      },
    }),
    db.customerPayment.findMany({
      where: { tenantId: tenant.id, customerId: customer.id },
      orderBy: { occurredAt: 'desc' },
      take: 100,
      select: { id: true, occurredAt: true, amountCents: true, method: true, branch: { select: { name: true } } },
    }),
  ]);

  // One merged, dated statement. A voided sale is shown (so the history is
  // honest) but no longer counts toward what's owed.
  type Item = { name: string; qty: number; unitPriceCents: number; lineTotalCents: number };
  type Entry = {
    kind: 'sale' | 'payment'; id: string; at: string; branch: string; amountCents: number; note: string;
    status?: string; items?: Item[];
  };
  const entries: Entry[] = [
    ...sales.map((s: typeof sales[number]) => ({
      kind: 'sale' as const,
      id: s.id,
      at: s.occurredAt.toISOString(),
      branch: s.branch?.name ?? '',
      amountCents: s.payments.reduce((sum: number, p: { amountCents: number }) => sum + p.amountCents, 0),
      note: s.status === 'completed' ? `Sale of ${(s.totalCents / 100).toFixed(2)}` : `Sale ${s.status}`,
      status: s.status,
      items: s.lines as Item[],
    })),
    ...payments.map((p: typeof payments[number]) => ({
      kind: 'payment' as const,
      id: p.id,
      at: p.occurredAt.toISOString(),
      branch: p.branch?.name ?? '',
      amountCents: p.amountCents,
      note: `Paid (${p.method})`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Everything they've taken on account, totalled per product (voided sales
  // excluded) — "what does Mai Simba usually buy on credit?" at a glance.
  const byProduct = new Map<string, { name: string; qty: number; totalCents: number }>();
  for (const s of sales) {
    if (s.status !== 'completed') continue;
    for (const l of s.lines as Item[]) {
      const row = byProduct.get(l.name) ?? { name: l.name, qty: 0, totalCents: 0 };
      row.qty += l.qty;
      row.totalCents += l.lineTotalCents;
      byProduct.set(l.name, row);
    }
  }
  const products = [...byProduct.values()].sort((a, b) => b.totalCents - a.totalCents);

  return ctx.json({ customer, entries, products });
});

// POST /customers/:id/payments — a repayment received outside the till
customerRoutes.post('/:id/payments', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const { amountCents, method, branchId } = z
    .object({
      amountCents: z.number().int().min(1),
      method: z.enum(REPAY_METHODS).default('cash'),
      branchId: z.string().uuid().optional(),
    })
    .parse(await ctx.req.json());

  const customer = await db.customer.findFirst({
    where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null },
  });
  if (!customer) return ctx.json({ message: 'Not found.' }, 404);

  // CustomerPayment needs a branch; the one the money came in at, else the default.
  const branch = branchId
    ? await db.branch.findFirst({ where: { id: branchId, tenantId: tenant.id, deletedAt: null } })
    : await db.branch.findFirst({
        where: { tenantId: tenant.id, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
  if (!branch) return ctx.json({ message: 'No branch found.' }, 422);

  const [, updated] = await db.$transaction([
    db.customerPayment.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        customerId: customer.id,
        branchId: branch.id,
        amountCents,
        method,
        occurredAt: new Date(),
      },
    }),
    // Not clamped at zero — an overpayment is real information (see
    // applyDebtRepayment's docblock for the same decision on the till path).
    db.customer.update({
      where: { id: customer.id },
      data: { balanceCents: { decrement: amountCents } },
      select: { balanceCents: true },
    }),
  ]);

  return ctx.json({
    message: `Recorded ${(amountCents / 100).toFixed(2)} from ${customer.name}. Now owes ${(updated.balanceCents / 100).toFixed(2)}.`,
    balanceCents: updated.balanceCents,
  }, 201);
});

// PATCH /customers/:id — correct name / phone (the balance is never edited directly)
customerRoutes.patch('/:id', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const data = z
    .object({ name: z.string().trim().min(1).max(120).optional(), phone: z.string().trim().max(40).nullable().optional() })
    .parse(await ctx.req.json());

  const customer = await db.customer.findFirst({
    where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null },
  });
  if (!customer) return ctx.json({ message: 'Not found.' }, 404);

  const updated = await db.customer.update({
    where: { id: customer.id },
    data: { ...data, ...(data.phone === '' ? { phone: null } : {}) },
    select: { id: true, name: true, phone: true, balanceCents: true },
  });
  return ctx.json(updated);
});

// DELETE /customers/:id — only once they owe nothing, so no debt is written off by accident
customerRoutes.delete('/:id', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const customer = await db.customer.findFirst({
    where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null },
  });
  if (!customer) return ctx.json({ message: 'Not found.' }, 404);
  if (customer.balanceCents !== 0) {
    return ctx.json({
      message: `${customer.name} still has a balance of ${(customer.balanceCents / 100).toFixed(2)}. Settle it before removing them.`,
    }, 422);
  }

  // Soft delete; updatedAt moves, so tills receive the tombstone on their next pull.
  await db.customer.update({ where: { id: customer.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: `Removed ${customer.name}.` });
});
