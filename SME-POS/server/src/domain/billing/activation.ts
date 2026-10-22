/**
 * Turning a paid payment into a paid period.
 *
 * Paynow tells us a payment was made in two ways, and either must do exactly the
 * same thing: its server-to-server webhook (routes/billing.ts POST /webhook), and
 * us asking it directly (POST /payments/check, which polls the payment's own
 * pollUrl). The second exists because the first can fail -- Paynow can't reach a
 * dev machine, a deploy drops its call, a retry never comes -- and a business that
 * has paid must not stay locked out because a message was lost.
 *
 * Both call activatePayment(), and it is safe to call twice, or from both at
 * once: a payment buys its period ONCE.
 */
import { db } from '../../lib/db.js';
import { monthsFromReference, nextPeriodEnd } from './maintenance.js';

/** The tenant's latest PAID subscription of this plan. (Tenant-scoped: call inside a tenant context.) */
export const paidSubscription = (plan: string) =>
  db.subscription.findFirst({ where: { plan, status: 'active' }, orderBy: { createdAt: 'desc' } });

export interface PendingPayment {
  id: string;
  tenantId: string;
  plan: string;
  providerRef: string | null;
  status: string;
}

/**
 * Marks a pending payment paid, starts the period it bought, and moves the
 * business onto the plan. Returns true if THIS call did it, false if the payment
 * had already been activated (by the webhook, a retry, or an earlier check).
 */
export async function activatePayment(subscription: PendingPayment): Promise<boolean> {
  // Paynow sends more than one "paid" message for a payment (Paid, then
  // Awaiting Delivery / Delivered) and retries. Each payment may extend the
  // period only ONCE, or a single payment would buy several months.
  if (subscription.status === 'active') return false;

  // Every payment buys 30-day periods -- one, or as many months as the
  // reference says (BYOD and maintenance can be paid ahead). It continues from
  // the end of the period already paid for, so paying early loses nothing; a plan
  // bought for the first time has no period yet, so it starts today -- for
  // Standard/Premium that is the "first month included". A plan purchase is always
  // one month, whatever its reference says.
  const isMaintenance = subscription.providerRef?.startsWith('maint_') ?? false;
  const months = isMaintenance || subscription.plan === 'byod' ? monthsFromReference(subscription.providerRef) : 1;
  const { tenantId, plan } = subscription;

  let activated = false;
  await db.$transaction(async (tx) => {
    // One payment of a business is applied at a time. Two can be confirmed together
    // (the webhook and "check my payment", or two payments still in flight, such as
    // an EcoCash prompt left unanswered and approved later); if both read the same
    // paid-through date and each added its months to it, every one but the last
    // would be lost -- the owner paying twice for one month. The lock is released when
    // this transaction ends.
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;

    // Claim the row: if a concurrent delivery already activated it, do nothing.
    const pending = await tx.subscription.findFirst({ where: { id: subscription.id, tenantId, status: { not: 'active' } } });
    if (!pending) return;

    // Continue from the furthest point already paid for -- not from the newest row:
    // Paynow confirms payments in whatever order it gets to them. (A plan purchase
    // confirmed while that plan is already paid -- the same plan bought in two tabs
    // -- therefore adds to it rather than cutting it back to a month from today.)
    let paidThrough: Date | null = null;
    const paid = await tx.subscription.findMany({ where: { tenantId, plan, status: 'active' } });
    for (const p of paid) {
      if (p.currentPeriodEnd && (!paidThrough || p.currentPeriodEnd > paidThrough)) paidThrough = p.currentPeriodEnd;
    }
    const currentPeriodEnd = nextPeriodEnd(new Date(), paidThrough, months);

    await tx.subscription.updateMany({
      where: { id: subscription.id, tenantId },
      data: { status: 'active', currentPeriodEnd },
    });
    // The dashboard reads the newest PAID row. When an older payment is confirmed
    // after a newer one, that newer row must not be left showing an earlier date
    // than the one just paid for.
    await tx.subscription.updateMany({
      where: { tenantId, plan, status: 'active', createdAt: { gt: pending.createdAt }, currentPeriodEnd: { lt: currentPeriodEnd } },
      data: { currentPeriodEnd },
    });
    await tx.tenant.update({
      where: { id: tenantId },
      data: { plan },
    });
    activated = true;
  }, TRANSACTION_PATIENCE);
  return activated;
}

/**
 * A payment waits its turn for the business lock, and that wait counts against the
 * transaction's time limit. Prisma's default is 5s -- not enough for several payments
 * queued behind one another on a database that is a long round trip away (six at once
 * took ~8s here), and the ones that ran out answered Paynow with a 500 although the
 * owner had paid. Generous, because a held lock is only ever a few statements long.
 */
export const TRANSACTION_PATIENCE = { maxWait: 15_000, timeout: 60_000 } as const;

/** How long an unpaid attempt is still worth asking Paynow about. */
export const PENDING_WINDOW_MS = 48 * 60 * 60 * 1000;
