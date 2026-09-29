/**
 * Orders — port of OrdersController, extended with void requests.
 *
 * Void design (matches VoidRequest's docblock in schema.prisma, and
 * ARCHITECTURE.md §5.2 — completed sales are immutable):
 *   - Any authenticated dashboard user may REQUEST a void, with a reason.
 *   - Only owner/manager may APPROVE or REJECT.
 *   - Approval never edits the sale. It flips `sales.status` to "voided"
 *     and appends one REVERSING stock movement per tracked line
 *     (+qty, reason "void", ref = sale id) — the same ledger-is-truth
 *     pattern as every other stock change in this system. The original
 *     sale/lines/payments rows are untouched, so revenue history and
 *     audit trail stay intact; reporting queries key off `status`.
 *   - At most one PENDING request per sale, enforced by a partial unique
 *     index at the DB layer (see prisma/migrations/…/migration.sql) —
 *     the app-level pre-check below is a friendlier error message, not
 *     the actual guarantee.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
import { localDayRange, localToday, parseDayParam } from '../lib/businessDay.js';

export const orderRoutes = new Hono<{ Variables: HonoVars }>();

const CAN_APPROVE = new Set(['owner', 'manager']);

// GET /orders?date=YYYY-MM-DD|today&branchId=&page= — list, with each sale's
// void-request status attached. With `date`, it's one day's sales (business
// local time) plus that whole day's summary; without, every sale, newest first.
orderRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const page = parseInt(ctx.req.query('page') ?? '1') || 1;
  const perPage = 50;

  const day = parseDayParam(ctx.req.query('date'));
  if ('error' in day) return ctx.json({ message: day.error }, 422);
  const date = day.date;
  const branchId = ctx.req.query('branchId') || undefined;
  const range = date ? localDayRange(date) : null;

  const where = {
    tenantId: t.id,
    deletedAt: null,
    ...(branchId ? { branchId } : {}),
    ...(range ? { occurredAt: { gte: range.start, lt: range.end } } : {}),
  };

  const [sales, total] = await Promise.all([
    db.sale.findMany({
      where,
      include: {
        cashier: { select: { name: true } },
        branch: { select: { name: true } },
        customer: { select: { name: true } },
        lines: { select: { qty: true, name: true, unitPriceCents: true } },
        payments: true,
      },
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.sale.count({ where }),
  ]);

  // The day's summary covers ALL of the day's sales, not just this page.
  // Takings count completed sales only — a voided sale was never money in.
  let summary = null;
  if (range) {
    const completed = { ...where, status: 'completed' };
    const [totals, voided, byMethod] = await Promise.all([
      db.sale.aggregate({ where: completed, _sum: { totalCents: true }, _count: true }),
      db.sale.count({ where: { ...where, status: 'voided' } }),
      db.payment.groupBy({
        by: ['method'],
        where: { tenantId: t.id, sale: { is: completed } },
        _sum: { amountCents: true },
      }),
    ]);
    summary = {
      sales: totals._count,
      takingsCents: totals._sum.totalCents ?? 0,
      voided,
      byMethod: byMethod
        .map((m: { method: string; _sum: { amountCents: number | null } }) => ({ method: m.method, amountCents: m._sum.amountCents ?? 0 }))
        .sort((a: { amountCents: number }, b: { amountCents: number }) => b.amountCents - a.amountCents),
    };
  }

  // VoidRequest is deliberately relation-free (see schema docblock), so the
  // join is explicit here: one query for every request against this page's
  // sales, most-recent-first, then keep only the latest per sale in JS.
  const saleIds = sales.map((s: typeof sales[number]) => s.id);
  const voidRequests = saleIds.length
    ? await db.voidRequest.findMany({
        where: { saleId: { in: saleIds }, tenantId: t.id },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const requesterIds = [...new Set(voidRequests.map((v: typeof voidRequests[number]) => v.requestedBy))];
  const requesters = requesterIds.length
    ? await db.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } })
    : [];
  const requesterName = new Map(requesters.map((u: typeof requesters[number]) => [u.id, u.name]));

  const latestVoidBySale = new Map<string, typeof voidRequests[number]>();
  for (const v of voidRequests) {
    if (!latestVoidBySale.has(v.saleId)) latestVoidBySale.set(v.saleId, v);
  }

  const data = sales.map((s: typeof sales[number]) => {
    const v = latestVoidBySale.get(s.id);
    return {
      ...s,
      voidRequest: v
        ? {
            id: v.id,
            status: v.status,
            reason: v.reason,
            requestedByName: requesterName.get(v.requestedBy) ?? 'Unknown',
            createdAt: v.createdAt,
          }
        : null,
    };
  });

  return ctx.json({ sales: data, total, page, perPage, date: date ?? null, today: localToday(), summary });
});

// GET /orders/void-requests — pending queue for admin review
orderRoutes.get('/void-requests', async (ctx) => {
  const user = ctx.get('user');
  const t = ctx.get('tenant');
  if (!CAN_APPROVE.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const requests = await db.voidRequest.findMany({
    where: { tenantId: t.id, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  const saleIds = requests.map((r: typeof requests[number]) => r.saleId);
  const userIds = [...new Set(requests.map((r: typeof requests[number]) => r.requestedBy))];

  const [sales, users] = await Promise.all([
    db.sale.findMany({
      where: { id: { in: saleIds } },
      select: { id: true, totalCents: true, occurredAt: true, status: true },
    }),
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const saleById = new Map(sales.map((s: typeof sales[number]) => [s.id, s]));
  const userById = new Map(users.map((u: typeof users[number]) => [u.id, u.name]));

  return ctx.json({
    requests: requests.map((r: typeof requests[number]) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.createdAt,
      requestedByName: userById.get(r.requestedBy) ?? 'Unknown',
      sale: saleById.get(r.saleId) ?? null,
    })),
  });
});

// POST /orders/:saleId/void-request — any authenticated staff
orderRoutes.post('/:saleId/void-request', async (ctx) => {
  const user = ctx.get('user');
  const t = ctx.get('tenant');
  const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(await ctx.req.json());

  const sale = await db.sale.findFirst({
    where: { id: ctx.req.param('saleId'), tenantId: t.id, deletedAt: null },
  });
  if (!sale) return ctx.json({ message: 'Not found.' }, 404);
  if (sale.status !== 'completed') {
    return ctx.json({ message: `This sale is already ${sale.status}.` }, 422);
  }

  const existingPending = await db.voidRequest.findFirst({
    where: { saleId: sale.id, status: 'pending' },
  });
  if (existingPending) {
    return ctx.json({ message: 'A void request is already pending for this sale.' }, 422);
  }

  const request = await db.voidRequest.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: t.id,
      saleId: sale.id,
      requestedBy: user.id,
      reason,
      status: 'pending',
    },
  });

  return ctx.json({ id: request.id, message: 'Void requested — waiting on admin approval.' }, 201);
});

// POST /orders/void-requests/:id/approve — owner/manager only
orderRoutes.post('/void-requests/:id/approve', async (ctx) => {
  const user = ctx.get('user');
  const t = ctx.get('tenant');
  if (!CAN_APPROVE.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const request = await db.voidRequest.findFirst({
    where: { id: ctx.req.param('id'), tenantId: t.id, status: 'pending' },
  });
  if (!request) return ctx.json({ message: 'No pending request found.' }, 404);

  const sale = await db.sale.findFirst({
    where: { id: request.saleId, tenantId: t.id },
    include: { lines: true, payments: true },
  });
  if (!sale) return ctx.json({ message: 'Sale no longer exists.' }, 404);
  if (sale.status !== 'completed') {
    return ctx.json({ message: `Sale is already ${sale.status} — nothing to void.` }, 422);
  }

  // Tenant-scoped product lookup, same reasoning as the sync engine (S7):
  // never let a reversal write against another tenant's catalog.
  const productIds = sale.lines.map((l: typeof sale.lines[number]) => l.productId).filter((id): id is string => Boolean(id));
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds }, tenantId: t.id }, select: { id: true, trackStock: true } })
    : [];
  const trackedIds = new Set(products.filter((p: typeof products[number]) => p.trackStock).map((p: typeof products[number]) => p.id));
  const creditCents = sale.payments
    .filter((p: typeof sale.payments[number]) => p.method === 'credit')
    .reduce((sum: number, p: typeof sale.payments[number]) => sum + p.amountCents, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.$transaction as any)(async (tx: typeof db) => {
    await tx.sale.update({ where: { id: sale.id }, data: { status: 'voided' } });

    for (const line of sale.lines) {
      if (!line.productId || !trackedIds.has(line.productId)) continue;

      await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: t.id,
          branchId: sale.branchId,
          productId: line.productId,
          delta: line.qty, // reversal: positive, undoing the original sale's negative
          reason: 'void',
          ref: sale.id,
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      });

      await tx.stockLevel.upsert({
        where: { branchId_productId: { branchId: sale.branchId, productId: line.productId } },
        create: {
          tenantId: t.id,
          branchId: sale.branchId,
          productId: line.productId,
          quantity: line.qty,
          updatedAt: new Date(),
        },
        update: { quantity: { increment: line.qty }, updatedAt: new Date() },
      });
    }

    // A voided credit sale was never really owed — take its credit back off
    // the customer's balance. Previously a void reversed the stock but left
    // the customer owing for goods the sale no longer records.
    if (creditCents > 0 && sale.customerId) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { balanceCents: { decrement: creditCents } },
      });
    }

    await tx.voidRequest.update({
      where: { id: request.id },
      data: { status: 'approved', decidedBy: user.id, decidedAt: new Date() },
    });
  });

  return ctx.json({
    message: creditCents > 0 && sale.customerId
      ? 'Sale voided, stock reversed and the credit removed from the customer’s balance.'
      : 'Sale voided and stock reversed.',
  });
});

// POST /orders/void-requests/:id/reject — owner/manager only
orderRoutes.post('/void-requests/:id/reject', async (ctx) => {
  const user = ctx.get('user');
  const t = ctx.get('tenant');
  if (!CAN_APPROVE.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const request = await db.voidRequest.findFirst({
    where: { id: ctx.req.param('id'), tenantId: t.id, status: 'pending' },
  });
  if (!request) return ctx.json({ message: 'No pending request found.' }, 404);

  await db.voidRequest.update({
    where: { id: request.id },
    data: { status: 'rejected', decidedBy: user.id, decidedAt: new Date() },
  });

  return ctx.json({ message: 'Void request rejected.' });
});
