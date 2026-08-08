/** Transactions (payments ledger) — port of TransactionsController */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const transactionRoutes = new Hono<{ Variables: HonoVars }>();

transactionRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const page = parseInt(ctx.req.query('page') ?? '1'); const perPage = 50;
  const [payments, total, summary] = await Promise.all([
    db.payment.findMany({
      where: { tenantId: t.id },
      include: { sale: { select: { occurredAt: true, branch: { select: { name: true } } } } },
      orderBy: { sale: { occurredAt: 'desc' } },
      skip: (page - 1) * perPage, take: perPage,
    }),
    db.payment.count({ where: { tenantId: t.id } }),
    db.payment.groupBy({ by: ['method'], where: { tenantId: t.id }, _sum: { amountCents: true }, _count: true }),
  ]);
  return ctx.json({ payments, total, page, perPage, summary });
});
