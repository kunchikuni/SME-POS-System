import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

/**
 * The money paths of billing.ts, run against a small in-memory stand-in for the
 * database and for Paynow: what each payment costs, which period it buys, and
 * that a replayed webhook can't buy a second one. (Hash verification itself is
 * paynow.ts's job; here it is a pass-through.)
 */
const mem = vi.hoisted(() => ({
  subs: [] as any[],
  tenant: { id: 't1', plan: 'trial' } as any,
  initiated: [] as any[],
  seq: 0,
}));

vi.mock('../lib/db.js', () => {
  const matches = (row: any, where: Record<string, any> = {}) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'not' in v ? row[k] !== v.not : row[k] === v);
  const subscription = {
    findFirst: async ({ where, orderBy }: any = {}) => {
      const rows = mem.subs.filter((r) => matches(r, where));
      if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
      return rows[0] ?? null;
    },
    create: async ({ data }: any) => {
      mem.subs.push({ currentPeriodEnd: null, createdAt: new Date(1_700_000_000_000 + mem.seq++), ...data });
      return data;
    },
    updateMany: async ({ where, data }: any) => {
      const rows = mem.subs.filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
  };
  const tenant = {
    update: async ({ data }: any) => { Object.assign(mem.tenant, data); return mem.tenant; },
  };
  return { db: { subscription, tenant, $transaction: async (fn: any) => fn({ subscription, tenant }) } };
});

vi.mock('../lib/paynow.js', () => ({
  initiateTransaction: async (input: any) => {
    mem.initiated.push(input);
    return { status: 'Ok', browserUrl: 'https://paynow.test/pay', pollUrl: 'https://paynow.test/poll' };
  },
  verifyHash: () => {},
  isPaidStatus: (s: string) => ['paid', 'awaiting delivery'].includes(s.toLowerCase()),
  PaynowNotConfiguredError: class extends Error {},
}));

const { billingRoutes, billingWebhookRoutes } = await import('./billing.js');

const DAY = 86_400_000;
const NOW = new Date('2026-10-01T12:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

function appFor(role = 'owner') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    (c as any).set('tenant', { ...mem.tenant, trialEndsAt: null, subscription: paidRow() });
    (c as any).set('user', { role, email: 'owner@shop.test' });
    await next();
  });
  app.route('/billing', billingRoutes);
  app.route('/billing', billingWebhookRoutes);
  return app;
}

/** The latest paid row, as resolveTenant would attach it to the tenant. */
const paidRow = () => {
  const rows = mem.subs.filter((r) => r.status === 'active').sort((a, b) => b.createdAt - a.createdAt);
  return rows[0] ? { status: 'active', zimraAddon: rows[0].zimraAddon ?? false, currentPeriodEnd: rows[0].currentPeriodEnd } : null;
};

let n = 0;
/** A subscription the business already paid for. */
function owns(plan: string, periodEnd: Date | null) {
  mem.subs.push({
    id: `s${n++}`, tenantId: 't1', plan, status: 'active', zimraAddon: false,
    currentPeriodEnd: periodEnd, createdAt: new Date(1_600_000_000_000 + mem.seq++),
  });
}

const post = (app: Hono, path: string, body?: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', host: 'shop.test' }, body: JSON.stringify(body ?? {}) });

/** Paynow telling us the pending payment was made. */
const paid = (app: Hono, reference: string, status = 'Paid') =>
  app.request('/billing/webhook', { method: 'POST', body: new URLSearchParams({ reference, status, hash: 'x' }) });

const pending = () => mem.subs.find((r) => r.status === 'trialing');
const latestPaid = () => mem.subs.filter((r) => r.status === 'active').sort((a, b) => b.createdAt - a.createdAt)[0];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mem.subs.length = 0;
  mem.initiated.length = 0;
  mem.tenant = { id: 't1', plan: 'trial' };
});
afterEach(() => vi.useRealTimers());

describe('buying Standard or Premium', () => {
  it('charges the full price, and the first month is included', async () => {
    const app = appFor();
    const res = await post(app, '/billing/payments/subscribe', { plan: 'standard' });
    expect(res.status).toBe(200);
    expect(mem.initiated[0].amount).toBe(199.99);
    expect(mem.initiated[0].reference).toMatch(/^sub_t1_/);

    await paid(app, pending().providerRef);
    expect(mem.tenant.plan).toBe('standard');
    expect(latestPaid().currentPeriodEnd).toEqual(at(30)); // a month from today — it is no longer "never expires"
  });

  it('is bought once: asking for several months does not multiply the price or the first period', async () => {
    const app = appFor();
    await post(app, '/billing/payments/subscribe', { plan: 'standard', months: 6 });
    expect(mem.initiated[0].amount).toBe(199.99);
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(30));
  });

  it('does the same for Premium', async () => {
    const app = appFor();
    await post(app, '/billing/payments/subscribe', { plan: 'premium' });
    expect(mem.initiated[0].amount).toBe(249);
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(30));
  });

  it('refuses to sell a plan the business already paid for — the monthly maintenance fee is what it owes', async () => {
    owns('standard', at(-40)); // ran out long ago
    mem.tenant.plan = 'standard';
    const res = await post(appFor(), '/billing/payments/subscribe', { plan: 'standard' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'already_purchased' });
    expect(mem.initiated).toHaveLength(0);
    expect(pending()).toBeUndefined();
  });

  it('still lets a Standard business upgrade to Premium at full price', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    const res = await post(appFor(), '/billing/payments/subscribe', { plan: 'premium' });
    expect(res.status).toBe(200);
    expect(mem.initiated[0].amount).toBe(249);
  });
});

describe('monthly maintenance', () => {
  it("costs the plan's own monthly maintenance fee and is told apart from a plan purchase by its reference", async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    const res = await post(appFor(), '/billing/payments/maintenance');
    expect(res.status).toBe(200);
    expect(mem.initiated[0].amount).toBe(7);
    expect(mem.initiated[0].reference).toMatch(/^maint_t1_/);
    expect(pending()).toMatchObject({ plan: 'standard', status: 'trialing' });
  });

  it('adds a month on top of the one already paid for when paid early', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    const app = appFor();
    await post(app, '/billing/payments/maintenance');
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(40)); // 10 days left + 30
  });

  it('can be paid ahead: three months is plain price, and the period grows by as many months', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    const app = appFor();
    await post(app, '/billing/payments/maintenance', { months: 3 });
    expect(mem.initiated[0].amount).toBe(21); // 3 × $7 — no discount
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(100)); // 10 days left + 3 × 30
  });

  it('pay for 6 months, get 1 free: charged for five ($35), covered for six', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    const app = appFor();
    await post(app, '/billing/payments/maintenance', { months: 6 });
    expect(mem.initiated[0].amount).toBe(35);
    expect(mem.initiated[0].reference).toMatch(/^maint_t1_\d+_m6$/); // the months COVERED, not the months charged
    expect(mem.initiated[0].additionalInfo).toContain('1 free');
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(190)); // 10 days left + 6 × 30
  });

  it('pay for 12 months, get 2 free: Premium is charged for ten ($120), covered for twelve', async () => {
    owns('premium', at(-75));
    mem.tenant.plan = 'premium';
    const app = appFor();
    await post(app, '/billing/payments/maintenance', { months: 12 });
    expect(mem.initiated[0].amount).toBe(120);
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(360)); // from today after a lapse
  });

  it('paid ahead after a lapse still starts from today', async () => {
    owns('premium', at(-75));
    mem.tenant.plan = 'premium';
    const app = appFor();
    await post(app, '/billing/payments/maintenance', { months: 3 });
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(90));
  });

  it('only takes the numbers of months the page offers', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    for (const months of [13, 0, -1, 2, 4, 7, 2.5, '3']) {
      const res = await post(appFor(), '/billing/payments/maintenance', { months });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(mem.initiated).toHaveLength(0);
  });

  it('after a lapse, one payment buys a month from today — nothing is back-billed', async () => {
    owns('premium', at(-75)); // two and a half months behind
    mem.tenant.plan = 'premium';
    const app = appFor();
    await post(app, '/billing/payments/maintenance');
    expect(mem.initiated[0].amount).toBe(12); // Premium
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(30));
  });

  it('is paid once per payment: Paynow repeating or retrying its message does not buy extra months', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    const app = appFor();
    await post(app, '/billing/payments/maintenance');
    const ref = pending().providerRef;

    await paid(app, ref, 'Paid');
    await paid(app, ref, 'Paid');
    await paid(app, ref, 'Awaiting Delivery');
    expect(latestPaid().currentPeriodEnd).toEqual(at(40)); // not 70 or 100
  });

  it('is not activated by a payment that has not been made', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    const app = appFor();
    await post(app, '/billing/payments/maintenance');
    await paid(app, pending().providerRef, 'Cancelled');
    expect(pending()).toBeTruthy();
    expect(latestPaid().currentPeriodEnd).toEqual(at(10));
  });

  it('keeps the ZIMRA add-on of the plan it renews', async () => {
    owns('premium', at(5));
    mem.subs[0].zimraAddon = true;
    mem.tenant.plan = 'premium';
    await post(appFor(), '/billing/payments/maintenance');
    expect(pending().zimraAddon).toBe(true);
  });

  it('does not apply to BYOD, a trial, or a business that never bought a plan', async () => {
    mem.tenant.plan = 'byod';
    expect((await post(appFor(), '/billing/payments/maintenance')).status).toBe(400);

    mem.tenant.plan = 'trial';
    expect((await post(appFor(), '/billing/payments/maintenance')).status).toBe(400);

    mem.tenant.plan = 'standard'; // set by hand, no payment on record
    const res = await post(appFor(), '/billing/payments/maintenance');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'no_purchase' });
    expect(mem.initiated).toHaveLength(0);
  });

  it('owes nothing on a plan bought before maintenance began (no end date on record)', async () => {
    owns('standard', null);
    mem.tenant.plan = 'standard';
    const res = await post(appFor(), '/billing/payments/maintenance');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'nothing_due' });
    expect(mem.initiated).toHaveLength(0);
  });

  it('can only be started by an owner or manager', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    expect((await post(appFor('cashier'), '/billing/payments/maintenance')).status).toBe(403);
    expect(mem.initiated).toHaveLength(0);
  });
});

describe('BYOD', () => {
  it('a renewal paid early continues from the end of the month already paid', async () => {
    owns('byod', at(6));
    mem.tenant.plan = 'byod';
    const app = appFor();
    await post(app, '/billing/payments/subscribe', { plan: 'byod' });
    expect(mem.initiated[0].amount).toBe(19.99);
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(36));
  });

  it('earns the free months too: 12 months for the price of 10', async () => {
    owns('byod', at(6));
    mem.tenant.plan = 'byod';
    const app = appFor();
    await post(app, '/billing/payments/subscribe', { plan: 'byod', months: 12 });
    expect(mem.initiated[0].amount).toBeCloseTo(199.9, 2); // 10 × $19.99
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(366)); // 6 days left + 12 × 30
  });

  it('can be paid several months ahead: the price times the months, and the period to match', async () => {
    owns('byod', at(6));
    mem.tenant.plan = 'byod';
    const app = appFor();
    await post(app, '/billing/payments/subscribe', { plan: 'byod', months: 3 });
    expect(mem.initiated[0].amount).toBeCloseTo(59.97, 2); // three months: no discount
    expect(mem.initiated[0].reference).toMatch(/_m3$/);
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(96)); // 6 days left + 90
  });

  it('the first payment buys a month from today', async () => {
    const app = appFor();
    await post(app, '/billing/payments/subscribe', { plan: 'byod' });
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(30));
  });
});

describe('GET /billing/payments', () => {
  const get = async (app: Hono) => (await app.request('/billing/payments')).json() as Promise<any>;

  it('lists the ways to pay ahead, with the months actually charged for each', async () => {
    const { prepay } = await get(appFor());
    expect(prepay).toEqual([
      { months: 1, billedMonths: 1 },
      { months: 3, billedMonths: 3 },
      { months: 6, billedMonths: 5 },
      { months: 12, billedMonths: 10 },
    ]);
  });

  it('lists the maintenance fee on Standard and Premium only', async () => {
    const { plans } = await get(appFor());
    expect(Object.fromEntries(plans.map((p: any) => [p.key, p.maintenanceCents]))).toEqual({
      byod: null, standard: 700, premium: 1200,
    });
  });

  it('reports what is paid through, and that the dashboard is open', async () => {
    owns('standard', at(10));
    mem.tenant.plan = 'standard';
    const body = await get(appFor());
    expect(body.maintenance).toMatchObject({ amountCents: 700, plan: 'standard', paidThrough: at(10).toISOString() });
    expect(body.access).toMatchObject({ blocked: false, kind: 'maintenance', daysLeft: 10 });
  });

  it('reports a lapsed maintenance month as a block', async () => {
    owns('standard', at(-4));
    mem.tenant.plan = 'standard';
    const body = await get(appFor());
    expect(body.access).toMatchObject({ blocked: true, kind: 'maintenance', daysLeft: null });
    expect(body.maintenance).toMatchObject({ paidThrough: at(-4).toISOString() });
  });

  it('shows no maintenance on a plan with no end date, and never mistakes an unpaid attempt for the current plan', async () => {
    owns('standard', null);
    mem.tenant.plan = 'standard';
    mem.subs.push({ id: 'p', tenantId: 't1', plan: 'premium', status: 'trialing', currentPeriodEnd: null, createdAt: new Date(1_900_000_000_000) });
    const body = await get(appFor());
    expect(body.maintenance).toBeNull();
    expect(body.subscription).toMatchObject({ plan: 'standard', status: 'active' });
  });
});
