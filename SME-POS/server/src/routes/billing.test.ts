import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  /** What asking Paynow about a payment answers; a test sets it to the answer it wants. */
  pollAnswer: ((_url: string): { status: string; reference: string | null } => ({ status: 'Created', reference: null })) as (url: string) => { status: string; reference: string | null },
  pollError: null as Error | null,
  polled: [] as string[],
  /** What a payment's activation did, in order: the business lock first, then the writes. */
  log: [] as string[],
  /** The time limits each payment's transaction was opened with. */
  txOptions: [] as any[],
}));

vi.mock('../lib/db.js', () => {
  const matches = (row: any, where: Record<string, any> = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
      if (v && typeof v === 'object' && 'gte' in v) return row[k] !== null && row[k] !== undefined && row[k] >= v.gte;
      if (v && typeof v === 'object' && 'gt' in v) return row[k] !== null && row[k] !== undefined && row[k] > v.gt;
      if (v && typeof v === 'object' && 'lt' in v) return row[k] !== null && row[k] !== undefined && row[k] < v.lt;
      return row[k] === v;
    });
  const subscription = {
    findFirst: async ({ where, orderBy }: any = {}) => {
      const rows = mem.subs.filter((r) => matches(r, where));
      if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
      return rows[0] ?? null;
    },
    findMany: async ({ where, orderBy, take }: any = {}) => {
      const rows = mem.subs.filter((r) => matches(r, where));
      if (orderBy?.createdAt === 'asc') rows.sort((a, b) => a.createdAt - b.createdAt);
      if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
      return take ? rows.slice(0, take) : rows;
    },
    count: async ({ where }: any = {}) => mem.subs.filter((r) => matches(r, where)).length,
    create: async ({ data }: any) => {
      // Created "now" (the test's frozen clock), a millisecond apart so order is stable.
      mem.subs.push({ currentPeriodEnd: null, createdAt: new Date(Date.now() + mem.seq++), ...data });
      return data;
    },
    updateMany: async ({ where, data }: any) => {
      const rows = mem.subs.filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      if (rows.length) mem.log.push('write');
      return { count: rows.length };
    },
  };
  const tenant = {
    update: async ({ data }: any) => { Object.assign(mem.tenant, data); mem.log.push('write'); return mem.tenant; },
  };
  // `SELECT ... FOR UPDATE` on the business: a transaction takes it before it reads or writes anything, and a
  // second transaction for the same business WAITS until the first has finished -- as Postgres makes it.
  const queue = new Map<string, Promise<void>>();
  const $transaction = async (fn: any, options?: unknown) => {
    mem.txOptions.push(options);
    const releases: (() => void)[] = [];
    const $queryRaw = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const key = String(values[0]);
      mem.log.push(`lock ${key}`);
      const before = queue.get(key) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((r) => { release = r; });
      queue.set(key, before.then(() => mine));
      releases.push(release);
      await before;
      return [{ id: key }];
    };
    try { return await fn({ subscription, tenant, $queryRaw }); } finally { releases.forEach((r) => r()); }
  };
  return { db: { subscription, tenant, $transaction } };
});

vi.mock('../lib/paynow.js', () => ({
  initiateTransaction: async (input: any) => {
    mem.initiated.push(input);
    return { status: 'Ok', browserUrl: 'https://paynow.test/pay', pollUrl: 'https://paynow.test/poll' };
  },
  pollTransaction: async (url: string) => {
    mem.polled.push(url);
    if (mem.pollError) throw mem.pollError;
    return mem.pollAnswer(url);
  },
  verifyHash: () => {},
  isPaidStatus: (s: string) => ['paid', 'awaiting delivery'].includes(s.toLowerCase()),
  PaynowNotConfiguredError: class extends Error {},
}));

const { billingRoutes, billingWebhookRoutes } = await import('./billing.js');
const { PaynowNotConfiguredError } = await import('../lib/paynow.js');
const { branchLimit, hasFeature } = await import('../domain/billing/entitlementService.js');

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

/** A paid row created AFTER everything made so far (owns() dates its rows in 2020, before any pending payment). */
function ownsNewer(plan: string, periodEnd: Date | null) {
  mem.subs.push({
    id: `s${n++}`, tenantId: 't1', plan, status: 'active', zimraAddon: false,
    currentPeriodEnd: periodEnd, createdAt: new Date(NOW.getTime() + 60_000 + mem.seq++),
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
  mem.polled.length = 0;
  mem.log.length = 0;
  mem.txOptions.length = 0;
  mem.pollError = null;
  mem.pollAnswer = () => ({ status: 'Created', reference: null });
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

describe('two payments in flight at once', () => {
  beforeEach(() => { owns('standard', at(10)); mem.tenant.plan = 'standard'; });

  /** Starts `n` maintenance payments, oldest first. */
  async function started(app: Hono, n: number) {
    for (let i = 0; i < n; i++) {
      // A reference carries the time it was made (to the millisecond), so two payments never share one; the test clock is frozen, so move it.
      vi.setSystemTime(new Date(NOW.getTime() + i));
      await post(app, '/billing/payments/maintenance');
    }
    vi.setSystemTime(NOW);
    return mem.subs.filter((r) => r.status === 'trialing').sort((a, b) => a.createdAt - b.createdAt).map((r) => r.providerRef as string);
  }
  const paidThrough = async (app: Hono) => ((await (await app.request('/billing/payments')).json()) as any).maintenance.paidThrough;

  it('both are credited in the order they were started: 10 days left + 2 months', async () => {
    const app = appFor();
    const [first, second] = await started(app, 2);
    await paid(app, first);
    await paid(app, second);
    expect(new Date(await paidThrough(app))).toEqual(at(70));
  });

  it('both are credited when the NEWER one is confirmed first (an abandoned prompt approved later)', async () => {
    const app = appFor();
    const [first, second] = await started(app, 2);
    await paid(app, second);
    expect(new Date(await paidThrough(app))).toEqual(at(40));
    await paid(app, first);
    // What the owner is shown -- the newest paid row -- must reach day 70, not stay at day 40 with a month paid for and lost.
    expect(new Date(await paidThrough(app))).toEqual(at(70));
    expect(latestPaid().currentPeriodEnd).toEqual(at(70));
  });

  it('continues from the furthest paid date, even when the newest row ends sooner', async () => {
    owns('standard', at(3)); // newer than the (day-10) row made above, but ending earlier
    mem.subs[0].currentPeriodEnd = at(100); // the older row is the one paid far ahead
    const app = appFor();
    await post(app, '/billing/payments/maintenance');
    await paid(app, pending().providerRef);
    expect(latestPaid().currentPeriodEnd).toEqual(at(130)); // 100 + 30, not 3 + 30
  });

  it("raising the newest paid row leaves a newer row of ANOTHER plan alone", async () => {
    const app = appFor();
    const [first] = await started(app, 2);
    ownsNewer('byod', at(2)); // a newer row of another plan, ending sooner than the new date
    await paid(app, first);
    expect(mem.subs.find((r) => r.plan === 'byod')!.currentPeriodEnd).toEqual(at(2));
  });

  it('…and a newer row of the same plan that never expires (no end date) stays that way', async () => {
    const app = appFor();
    const [first] = await started(app, 2);
    ownsNewer('standard', null); // an older purchase, from before plans had periods: no end, so never locks
    await paid(app, first);
    expect(mem.subs.filter((r) => r.plan === 'standard' && r.status === 'active' && r.id !== 's0').some((r) => r.currentPeriodEnd === null)).toBe(true);
  });

  it('but does raise a newer paid row of the same plan that ends sooner, so the owner is shown the new date', async () => {
    const app = appFor();
    const [first] = await started(app, 2);
    ownsNewer('standard', at(5)); // created after the pending payment, ends sooner than where it will be credited to
    await paid(app, first);
    expect(paidRow()!.currentPeriodEnd).toEqual(at(40)); // 10 days (the furthest row) + 30
    expect(mem.subs.filter((r) => r.status === 'active').map((r) => r.currentPeriodEnd.getTime())).not.toContain(at(5).getTime());
    expect(mem.subs[0].currentPeriodEnd).toEqual(at(10)); // the older paid row is history: left exactly as it was
  });

  it('five simultaneous deliveries of ONE payment add its month once', async () => {
    const app = appFor();
    const [first] = await started(app, 2);
    const answers = await Promise.all(Array.from({ length: 5 }, () => paid(app, first)));
    expect(answers.every((r) => r.status === 200)).toBe(true);
    expect(latestPaid().currentPeriodEnd).toEqual(at(40));
    expect(mem.subs.filter((r) => r.status === 'active' && r.providerRef === first)).toHaveLength(1);
  });

  it('three DIFFERENT payments confirmed at the same moment all count: 10 days + 3 months', async () => {
    const app = appFor();
    const refs = await started(app, 3);
    await Promise.all(refs.map((ref) => paid(app, ref)));
    expect(paidRow()!.currentPeriodEnd).toEqual(at(100));
    expect(new Date(await paidThrough(app))).toEqual(at(100));
  });

  it('the same plan bought twice, both confirmed, never cuts back what was already paid', async () => {
    // Two tabs, two full-price purchases of Standard. The second used to be dated "a month from today" -- earlier than
    // what the business had already paid for -- and, being the newest row, was the date the owner was shown.
    const app = appFor();
    mem.subs.length = 0;
    owns('standard', at(100));
    mem.tenant.plan = 'standard';
    mem.subs.push({ id: 'dup', tenantId: 't1', plan: 'standard', status: 'trialing', providerRef: `sub_t1_${Date.now()}_m1`, pollUrl: 'u', currentPeriodEnd: null, createdAt: new Date(NOW.getTime() + 1000) });
    await paid(app, mem.subs.find((r) => r.id === 'dup')!.providerRef);
    expect(paidRow()!.currentPeriodEnd).toEqual(at(130));
  });

  it('applies a payment under a lock on the business, taken before anything is written', async () => {
    const app = appFor();
    const [first] = await started(app, 2);
    mem.log.length = 0;
    await paid(app, first);
    expect(mem.log[0]).toBe('lock t1');
    expect(mem.log.filter((e) => e.startsWith('lock'))).toHaveLength(1);
    expect(mem.log.slice(1).every((e) => e === 'write')).toBe(true);
  });

  it("a payment may queue behind others for the lock: its transaction is given far more than Prisma's 5-second default", async () => {
    const app = appFor();
    const [first] = await started(app, 2);
    mem.txOptions.length = 0;
    await paid(app, first);
    expect(mem.txOptions).toHaveLength(1);
    expect(mem.txOptions[0].timeout).toBeGreaterThanOrEqual(30_000);
    expect(mem.txOptions[0].maxWait).toBeGreaterThanOrEqual(10_000);
  });

  it('a repeated "Paid" message takes the lock and changes nothing', async () => {
    const app = appFor();
    const [first] = await started(app, 2);
    await paid(app, first);
    const after = latestPaid().currentPeriodEnd;
    mem.log.length = 0;
    await paid(app, first);
    await paid(app, first, 'Delivered');
    expect(latestPaid().currentPeriodEnd).toEqual(after);
    expect(mem.log.filter((e) => e === 'write')).toHaveLength(0);
  });
});

describe('asking Paynow when the webhook never came', () => {
  const check = (app: Hono) => post(app, '/billing/payments/check');
  /** A maintenance payment the business started and (as far as we know) has not finished. */
  async function startMaintenance(app: Hono, months = 1) {
    await post(app, '/billing/payments/maintenance', { months });
    return mem.subs.filter((r) => r.status === 'trialing').at(-1)!;
  }
  const paidAnswer = (ref: string) => () => ({ status: 'Paid', reference: ref });

  beforeEach(() => { owns('standard', at(10)); mem.tenant.plan = 'standard'; });

  it('activates a payment Paynow says was paid, exactly as the webhook would', async () => {
    const app = appFor();
    const p = await startMaintenance(app);
    mem.pollAnswer = paidAnswer(p.providerRef);

    const res = await check(app);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1, activated: 1, unreachable: 0 });
    expect(latestPaid().currentPeriodEnd).toEqual(at(40)); // 10 days left + 30
    expect(mem.polled).toEqual([p.pollUrl]);
  });

  it('is not undone, or doubled, when the webhook turns up late', async () => {
    const app = appFor();
    const p = await startMaintenance(app);
    mem.pollAnswer = paidAnswer(p.providerRef);
    await check(app);
    await paid(app, p.providerRef);          // Paynow's message, finally
    await paid(app, p.providerRef, 'Delivered');
    expect(latestPaid().currentPeriodEnd).toEqual(at(40)); // still one month, not three
  });

  it('has nothing left to ask about once the webhook has done it', async () => {
    const app = appFor();
    const p = await startMaintenance(app);
    await paid(app, p.providerRef);
    expect(await (await check(app)).json()).toEqual({ checked: 0, activated: 0, unreachable: 0 });
    expect(mem.polled).toHaveLength(0);
  });

  it('can be run as often as you like: the second time changes nothing', async () => {
    const app = appFor();
    const p = await startMaintenance(app);
    mem.pollAnswer = paidAnswer(p.providerRef);
    await check(app);
    const again = await (await check(app)).json();
    expect(again).toMatchObject({ activated: 0 });
    expect(latestPaid().currentPeriodEnd).toEqual(at(40));
  });

  it('leaves a payment that has not been made pending, to ask again later', async () => {
    const app = appFor();
    const p = await startMaintenance(app);
    mem.pollAnswer = () => ({ status: 'Created', reference: p.providerRef });
    expect(await (await check(app)).json()).toEqual({ checked: 1, activated: 0, unreachable: 0 });
    expect(p.status).toBe('trialing');
    expect(latestPaid().currentPeriodEnd).toEqual(at(10));
  });

  it('takes a cancelled payment for what it is — not paid', async () => {
    const app = appFor();
    const p = await startMaintenance(app);
    mem.pollAnswer = () => ({ status: 'Cancelled', reference: p.providerRef });
    expect(await (await check(app)).json()).toMatchObject({ activated: 0 });
    expect(p.status).toBe('trialing');
  });

  it('ignores an answer that is about some other payment', async () => {
    const app = appFor();
    const p = await startMaintenance(app);
    mem.pollAnswer = paidAnswer('maint_someone-else_123_m1');
    expect(await (await check(app)).json()).toMatchObject({ checked: 1, activated: 0 });
    expect(p.status).toBe('trialing');
  });

  it('shrugs off a Paynow that cannot be reached — not an error, and the payment stays pending', async () => {
    const app = appFor();
    const p = await startMaintenance(app);
    mem.pollError = new Error('timeout');
    const res = await check(app);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1, activated: 0, unreachable: 1 });
    expect(p.status).toBe('trialing');
  });

  it('says so plainly when payments are not set up at all', async () => {
    const app = appFor();
    await startMaintenance(app);
    mem.pollError = new PaynowNotConfiguredError();
    const res = await check(app);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ message: expect.stringContaining('not configured') });
  });

  it('only asks about payments from the last two days, and at most three', async () => {
    const app = appFor();
    mem.subs.push({ id: 'old', tenantId: 't1', plan: 'standard', status: 'trialing', providerRef: 'maint_old', pollUrl: 'https://paynow.test/old', createdAt: at(-3), currentPeriodEnd: null });
    for (let i = 0; i < 5; i++) await startMaintenance(app);
    await check(app);
    expect(mem.polled).toHaveLength(3);
    expect(mem.polled).not.toContain('https://paynow.test/old');
  });

  it('does not ask about attempts that never reached Paynow (no poll address)', async () => {
    mem.subs.push({ id: 'x', tenantId: 't1', plan: 'standard', status: 'trialing', providerRef: 'maint_x', pollUrl: null, createdAt: new Date(Date.now() + 99), currentPeriodEnd: null });
    expect(await (await check(appFor())).json()).toEqual({ checked: 0, activated: 0, unreachable: 0 });
  });

  it('applies two paid payments in the order they were made', async () => {
    const app = appFor();
    const first = await startMaintenance(app, 3);
    const second = await startMaintenance(app, 3);
    // Paynow answers "paid" for each, oldest first -- the order the check asks in.
    mem.pollAnswer = (() => { let i = 0; return () => ({ status: 'Paid', reference: [first, second][i++].providerRef }); })();
    expect(await (await check(app)).json()).toMatchObject({ checked: 2, activated: 2 });
    expect(latestPaid().currentPeriodEnd).toEqual(at(190)); // 10 days left + 3 × 30 + 3 × 30
  });

  it('is for an owner or manager only', async () => {
    const app = appFor('cashier');
    await startMaintenance(appFor());
    expect((await check(app)).status).toBe(403);
    expect(mem.polled).toHaveLength(0);
  });

  it('is counted on the Payments page, so it can offer to check', async () => {
    const app = appFor();
    const get = async () => (await (await app.request('/billing/payments')).json()) as any;
    expect((await get()).pending).toBe(0);
    await startMaintenance(app);
    expect((await get()).pending).toBe(1);
    mem.subs.push({ id: 'old', tenantId: 't1', plan: 'standard', status: 'trialing', providerRef: 'maint_old', pollUrl: 'https://paynow.test/old', createdAt: at(-3), currentPeriodEnd: null });
    expect((await get()).pending).toBe(1); // an old abandoned attempt is not offered
    await paid(app, mem.subs.find((r) => r.status === 'trialing' && r.id !== 'old')!.providerRef);
    expect((await get()).pending).toBe(0); // paid: nothing left to check
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

  it("shows each plan's branch count exactly as the server enforces it — the two tables cannot drift", async () => {
    const { plans } = await get(appFor());
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      const enforced = branchLimit({
        plan: p.key, trialEndsAt: null,
        subscription: { status: 'active', zimraAddon: false, currentPeriodEnd: at(20) },
      });
      expect(p.branches, p.key).toBe(enforced);
    }
    expect(Object.fromEntries(plans.map((p: any) => [p.key, p.branches]))).toEqual({ byod: 1, standard: 5, premium: null });
  });

  it("plan cards state the till and staff limits the server enforces", async () => {
    const { plans } = await get(appFor());
    const features = Object.fromEntries(plans.map((p: any) => [p.key, p.features as string[]]));
    expect(features.byod).toEqual(expect.arrayContaining(['1 till', '5 staff accounts']));
    expect(features.standard).toEqual(expect.arrayContaining(['Up to 2 tills per branch', '15 staff accounts']));
    expect(features.premium).toContain('Unlimited tills and staff accounts');
    // Standard must not claim BYOD's single till through "Everything in BYOD" alone.
    expect(features.standard.indexOf('Up to 2 tills per branch')).toBeGreaterThan(features.standard.indexOf('Everything in BYOD'));
  });

  it('plan cards promise what the gates deliver: Tasks on BYOD, Reports from Standard up', async () => {
    const { plans } = await get(appFor());
    const features = Object.fromEntries(plans.map((p: any) => [p.key, p.features as string[]]));
    expect(features.byod).toContain('Tasks');
    expect(features.byod.join(' ')).not.toMatch(/report/i);
    expect(features.standard).toContain('Reports & analytics');
    // The card text and the gate must agree, plan by plan.
    for (const p of plans) {
      const gate = hasFeature({ plan: p.key, trialEndsAt: null, subscription: { status: 'active', zimraAddon: false, currentPeriodEnd: at(20) } }, 'analytics');
      expect(gate, p.key).toBe(p.key !== 'byod');
    }
  });

  // The marketing page is a separate static site and can't import the server's table, so its
  // plan cards are typed out by hand. This is the one thing that notices them drifting apart.
  const marketingPage = fileURLToPath(new URL('../../../marketing/src/pages/index.astro', import.meta.url));
  it.skipIf(!existsSync(marketingPage))('plan cards say what the marketing page says: label, price, branches and every feature, in order', async () => {
    const source = readFileSync(marketingPage, 'utf8');
    const card = (key: string) => {
      const line = source.split('\n').find((l) => l.trimStart().startsWith(`${key}: {`));
      if (!line) throw new Error(`the marketing page has no "${key}" plan`);
      const field = (re: RegExp) => line.match(re)?.[1];
      const branches = field(/branches: (\d+|null)/);
      return {
        label: field(/label: "([^"]*)"/),
        price: Number(field(/price: ([\d.]+)/)),
        recurring: field(/recurring: (true|false)/) === 'true',
        maintenance: /maintenance: true/.test(line),
        branches: branches === 'null' ? null : Number(branches),
        features: JSON.parse(`[${field(/features: \[(.*)\]/)}]`) as string[],
      };
    };
    const { plans } = await get(appFor());
    expect(plans.map((p: any) => p.key)).toEqual(['byod', 'standard', 'premium']);
    for (const p of plans) {
      const m = card(p.key);
      expect(m.label, `${p.key} label`).toBe(p.label);
      expect(Math.round(m.price * 100), `${p.key} price`).toBe(p.amountCents);
      expect(m.recurring, `${p.key} recurring`).toBe(p.recurring);
      expect(m.maintenance, `${p.key} monthly maintenance`).toBe((p.maintenanceCents ?? 0) > 0);
      expect(m.branches, `${p.key} branches`).toBe(p.branches);
      expect(m.features, `${p.key} features`).toEqual(p.features);
    }
  });

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
