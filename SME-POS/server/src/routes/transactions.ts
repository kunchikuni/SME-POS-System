/** Transactions (payments ledger) — port of TransactionsController */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
import { localDayRange, localToday, parseDayParam } from '../lib/businessDay.js';
export const transactionRoutes = new Hono<{ Variables: HonoVars }>();

// GET /transactions?date=YYYY-MM-DD|today&branchId=&page=
//
// Every payment, newest first — or, with `date`, one day's payments (business
// local time, lib/businessDay.ts) with that whole day's totals per method.
// Totals count payments on COMPLETED sales only: a voided sale's payment is
// still listed (marked) so the ledger stays honest, but it was never money in.
transactionRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const page = parseInt(ctx.req.query('page') ?? '1') || 1;
  const perPage = 50;

  const day = parseDayParam(ctx.req.query('date'));
  if ('error' in day) return ctx.json({ message: day.error }, 422);
  const range = day.date ? localDayRange(day.date) : null;
  const branchId = ctx.req.query('branchId') || undefined;

  const saleFilter = {
    deletedAt: null,
    ...(branchId ? { branchId } : {}),
    ...(range ? { occurredAt: { gte: range.start, lt: range.end } } : {}),
  };
  const where = { tenantId: t.id, sale: { is: saleFilter } };

  const [payments, total, summary] = await Promise.all([
    db.payment.findMany({
      where,
      include: {
        sale: {
          select: {
            occurredAt: true,
            status: true,
            branch: { select: { name: true } },
            cashier: { select: { name: true } },
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { sale: { occurredAt: 'desc' } },
      skip: (page - 1) * perPage, take: perPage,
    }),
    db.payment.count({ where }),
    db.payment.groupBy({
      by: ['method'],
      where: { tenantId: t.id, sale: { is: { ...saleFilter, status: 'completed' } } },
      _sum: { amountCents: true },
      _count: true,
    }),
  ]);

  return ctx.json({ payments, total, page, perPage, summary, date: day.date, today: localToday() });
});
