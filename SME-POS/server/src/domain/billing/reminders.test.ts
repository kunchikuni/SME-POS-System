import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessSummary, type TenantForEntitlement } from './entitlementService.js';
import { reminderEmail, reminderSms } from './reminderEmail.js';

/** A little in-memory stand-in for the database, and for tenant scoping. */
const mem = vi.hoisted(() => ({
  tenants: [] as any[],
  subs: [] as any[],
  users: [] as any[],
  reminders: [] as any[],
  scope: null as string | null,
  /** Pretend the next "already sent?" lookup finds nothing, though another server has just claimed it. */
  hideClaimOnce: false,
}));

vi.mock('../../lib/tenantScope.js', () => ({
  runWithTenant: async (id: string, fn: () => Promise<unknown>) => { mem.scope = id; try { return await fn(); } finally { mem.scope = null; } },
  withoutTenantScope: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../lib/db.js', () => {
  const inWindow = (d: Date | null, w: { gte: Date; lte: Date }) => d !== null && d >= w.gte && d <= w.lte;
  const sameClaim = (r: any, w: any) =>
    r.tenantId === mem.scope && r.periodEnd.getTime() === w.periodEnd.getTime() && r.stage === w.stage && r.channel === w.channel;
  return {
    db: {
      tenant: {
        findMany: async ({ where }: any) =>
          mem.tenants.filter((t) => t.plan === 'trial' && t.status !== 'suspended' && inWindow(t.trialEndsAt, where.trialEndsAt)).map((t) => ({ id: t.id })),
        findFirst: async ({ where }: any) => {
          // Honour the query as written: a caller that forgets to exclude suspended businesses gets them back.
          const t = mem.tenants.find((x) => x.id === where.id && (!where.status || x.status !== where.status.not));
          if (!t) return null;
          const subscriptions = mem.subs.filter((s) => s.tenantId === t.id && s.status === 'active')
            .sort((a, b) => b.createdAt - a.createdAt).slice(0, 1);
          return { ...t, subscriptions };
        },
      },
      subscription: {
        findMany: async ({ where }: any) =>
          mem.subs.filter((s) => s.status === 'active' && inWindow(s.currentPeriodEnd, where.currentPeriodEnd)).map((s) => ({ tenantId: s.tenantId })),
      },
      user: {
        findMany: async () => mem.users.filter((u) => u.tenantId === mem.scope && u.role === 'owner'),
      },
      billingReminder: {
        findFirst: async ({ where }: any) => {
          if (mem.hideClaimOnce) { mem.hideClaimOnce = false; return null; }
          return mem.reminders.find((r) => sameClaim(r, where)) ?? null;
        },
        create: async ({ data }: any) => {
          const dup = mem.reminders.some((r) => r.tenantId === data.tenantId && r.periodEnd.getTime() === data.periodEnd.getTime() && r.stage === data.stage && r.channel === data.channel);
          if (dup) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
          mem.reminders.push(data);
          return data;
        },
        deleteMany: async ({ where }: any) => {
          mem.reminders = mem.reminders.filter((r) => !sameClaim(r, where));
        },
      },
    },
  };
});

const { reminderStage, runBillingReminders, paymentsUrl } = await import('./reminders.js');

const DAY = 86_400_000;
const NOW = new Date('2026-10-01T12:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const trialTenant = (days: number): TenantForEntitlement => ({ plan: 'trial', trialEndsAt: at(days), subscription: null });
const paidTenant = (plan: string, days: number | null): TenantForEntitlement => ({
  plan, trialEndsAt: null,
  subscription: { status: 'active', zimraAddon: false, currentPeriodEnd: days === null ? null : at(days) },
});
const stage = (t: TenantForEntitlement) => reminderStage(accessSummary(t, NOW), NOW);

describe('reminderStage — which reminder a business is due', () => {
  it('says nothing while the period is comfortably running', () => {
    expect(stage(paidTenant('standard', 20))).toBeNull();
    expect(stage(paidTenant('standard', 5.5))).toBeNull();
    expect(stage(trialTenant(4))).toBeNull();
  });

  it('gives a heads-up five days before a paid period ends (two before a trial does)', () => {
    expect(stage(paidTenant('standard', 5))).toBe('soon');
    expect(stage(paidTenant('byod', 3))).toBe('soon');
    expect(stage(trialTenant(2))).toBe('soon');
    expect(stage(trialTenant(3))).toBeNull(); // a 7-day trial is not nagged on day 4
  });

  it('reminds again with a day to go', () => {
    expect(stage(paidTenant('premium', 1))).toBe('tomorrow');
    expect(stage(paidTenant('premium', 0.2))).toBe('tomorrow');
    expect(stage(trialTenant(1))).toBe('tomorrow');
  });

  describe('once it has ended — BYOD and trials keep selling 3 days', () => {
    it('says the dashboard is locked while the tills still sell', () => {
      expect(stage(paidTenant('byod', -0.5))).toBe('ended');
      expect(stage(trialTenant(-0.5))).toBe('ended');
    });

    it('warns again two days before the tills stop', () => {
      expect(stage(paidTenant('byod', -1.5))).toBe('pausing');
      expect(stage(paidTenant('byod', -2.9))).toBe('pausing');
    });

    it('says the tills have paused — for two days, then leaves an abandoned account alone', () => {
      expect(stage(paidTenant('byod', -3.5))).toBe('paused');
      expect(stage(paidTenant('byod', -4.5))).toBe('paused');
      expect(stage(paidTenant('byod', -6))).toBeNull();
    });
  });

  describe('once it has ended — Standard and Premium keep selling 14 days', () => {
    it('stays at "ended" for most of the fortnight', () => {
      expect(stage(paidTenant('standard', -0.5))).toBe('ended');
      expect(stage(paidTenant('premium', -5))).toBe('ended');
      expect(stage(paidTenant('standard', -11.9))).toBe('ended');
    });

    it('warns two days before the tills stop, on day 12 and 13', () => {
      expect(stage(paidTenant('standard', -12.5))).toBe('pausing');
      expect(stage(paidTenant('premium', -13.5))).toBe('pausing');
    });

    it('says the tills have paused only after the fortnight', () => {
      expect(stage(paidTenant('standard', -14.5))).toBe('paused');
      expect(stage(paidTenant('standard', -17))).toBeNull();
    });
  });

  it('has nothing to say about a plan with no end date', () => {
    expect(stage(paidTenant('standard', null))).toBeNull();
  });
});

describe('reminderEmail — the words', () => {
  const base = { businessName: 'Acme Hardware', ownerName: 'Tendai Moyo', endsAt: at(4), graceEndsAt: at(18), payUrl: 'https://acme.wivae.test/settings/payments' };

  it('names the $5 and links to Payments for a Standard/Premium business', () => {
    const { subject, html } = reminderEmail({ ...base, stage: 'soon', kind: 'maintenance' });
    expect(subject).toContain('maintenance');
    expect(subject).toContain('$5');
    expect(html).toContain('href="https://acme.wivae.test/settings/payments"');
    expect(html).toContain('Pay $5');
  });

  it('mentions the free months for paying ahead', () => {
    const { html } = reminderEmail({ ...base, stage: 'soon', kind: 'maintenance' });
    expect(html).toContain('6 months and get 1 free');
    expect(html).toContain('12 months and get 2 free');
  });

  it('quotes the BYOD price, and never says "maintenance" to BYOD', () => {
    const { subject, html } = reminderEmail({ ...base, stage: 'tomorrow', kind: 'monthly' });
    expect(`${subject} ${html}`).toContain('$19.99');
    expect(`${subject} ${html}`).not.toMatch(/maintenance/i);
  });

  it('tells a trial to choose a plan, with no price to pay', () => {
    const { subject, html } = reminderEmail({ ...base, stage: 'soon', kind: 'trial' });
    expect(subject).toContain('free trial');
    expect(html).toContain('Choose a plan');
    expect(html).not.toContain('Pay $');
  });

  it('when it has ended: the dashboard is locked and the tills keep selling until a date', () => {
    const { html } = reminderEmail({ ...base, stage: 'ended', kind: 'maintenance' });
    expect(html).toContain('dashboard is locked');
    expect(html).toContain('keep selling until');
    expect(html).toContain('19 Oct 2026'); // the end of the 14 days, not an invented "3 days"
  });

  it('just before the tills stop: when, and that sales are kept', () => {
    const { subject, html } = reminderEmail({ ...base, stage: 'pausing', kind: 'maintenance' });
    expect(subject).toContain('tills pause on');
    expect(html).toContain('saved on each device');
  });

  it('when the tills have paused: sales are safe and sync once paid', () => {
    const { subject, html } = reminderEmail({ ...base, stage: 'paused', kind: 'maintenance' });
    expect(subject).toContain('tills have paused');
    expect(html).toContain('saved on the device');
    expect(html).toContain('as soon as you pay');
  });

  it('always says nothing is charged automatically', () => {
    for (const s of ['soon', 'tomorrow', 'ended', 'pausing', 'paused'] as const) {
      expect(reminderEmail({ ...base, stage: s, kind: 'maintenance' }).html).toContain('never charges you automatically');
    }
  });

  it('escapes what a business typed into its own name', () => {
    const { html } = reminderEmail({ ...base, businessName: '<script>alert(1)</script> & Sons', ownerName: '<b>x</b>', stage: 'soon', kind: 'maintenance' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('reminderSms — the text', () => {
  const base = { businessName: 'Acme Hardware', ownerName: 'Tendai Moyo', endsAt: at(4), graceEndsAt: at(18), payUrl: 'https://acme.wivae.co.zw/settings/payments' };
  const stages = ['soon', 'tomorrow', 'ended', 'pausing', 'paused'] as const;
  const kinds = ['trial', 'maintenance', 'monthly'] as const;

  it('is plain ASCII, so it is not billed as a (70-character) Unicode message', () => {
    for (const s of stages) for (const k of kinds) {
      expect(reminderSms({ ...base, stage: s, kind: k })).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it('fits one 160-character message with a typical workspace address', () => {
    for (const s of stages) for (const k of kinds) {
      const body = reminderSms({ ...base, stage: s, kind: k });
      expect(body.length, `${k}/${s}: ${body}`).toBeLessThanOrEqual(160);
    }
  });

  it('always carries the link to pay', () => {
    for (const s of stages) for (const k of kinds) {
      expect(reminderSms({ ...base, stage: s, kind: k })).toContain(base.payUrl);
    }
  });

  it('says the amount, and when', () => {
    expect(reminderSms({ ...base, stage: 'tomorrow', kind: 'maintenance' })).toMatch(/\$5 maintenance is due tomorrow \(5 Oct\)/);
    expect(reminderSms({ ...base, stage: 'tomorrow', kind: 'monthly' })).toContain('$19.99');
    expect(reminderSms({ ...base, stage: 'ended', kind: 'maintenance' })).toContain('keep selling until 19 Oct');
    expect(reminderSms({ ...base, stage: 'pausing', kind: 'maintenance' })).toContain('pause on 19 Oct');
  });

  it('tells a trial to choose a plan', () => {
    expect(reminderSms({ ...base, stage: 'tomorrow', kind: 'trial' })).toContain('Choose a plan');
    expect(reminderSms({ ...base, stage: 'tomorrow', kind: 'trial' })).not.toContain('$');
  });
});

describe('paymentsUrl', () => {
  it("points at the business's own subdomain", () => {
    const keep = { d: process.env.TENANT_DOMAIN, s: process.env.APP_SCHEME };
    process.env.TENANT_DOMAIN = 'wivae.co.zw';
    process.env.APP_SCHEME = 'https';
    expect(paymentsUrl('acme')).toBe('https://acme.wivae.co.zw/settings/payments');
    process.env.TENANT_DOMAIN = keep.d; process.env.APP_SCHEME = keep.s;
    if (keep.d === undefined) delete process.env.TENANT_DOMAIN;
    if (keep.s === undefined) delete process.env.APP_SCHEME;
  });
});

describe('runBillingReminders', () => {
  const mails: { to: string; subject: string }[] = [];
  const texts: { to: string; body: string }[] = [];
  const deps = (over: Record<string, unknown> = {}) => ({
    now: NOW,
    emailConfigured: () => true,
    smsConfigured: () => true,
    send: async (to: string, subject: string) => { mails.push({ to, subject }); },
    sendText: async (to: string, body: string) => { texts.push({ to, body }); },
    ...over,
  });
  let seq = 0;
  const addTenant = (id: string, t: Partial<any> & { plan: string }) =>
    mem.tenants.push({ id, name: `Shop ${id}`, subdomain: id, status: 'active', trialEndsAt: null, deletedAt: null, ...t });
  const addSub = (tenantId: string, plan: string, days: number | null) =>
    mem.subs.push({ tenantId, plan, status: 'active', zimraAddon: false, currentPeriodEnd: days === null ? null : at(days), createdAt: seq++ });
  const addOwner = (tenantId: string, email = `owner@${tenantId}.test`, phone: string | null = null) =>
    mem.users.push({ tenantId, role: 'owner', email, name: 'Tendai Moyo', phone });

  beforeEach(() => {
    mem.tenants = []; mem.subs = []; mem.users = []; mem.reminders = []; mem.scope = null; mem.hideClaimOnce = false;
    mails.length = 0; texts.length = 0;
  });

  describe('email', () => {
    it('emails the owner the reminder they are due', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1');
      const run = await runBillingReminders(deps());
      expect(run.sent).toEqual([{ tenantId: 't1', stage: 'soon', channel: 'email' }]);
      expect(mails).toHaveLength(1);
      expect(mails[0].to).toBe('owner@t1.test');
      expect(mails[0].subject).toContain('maintenance');
    });

    it('sends each reminder once, however often it runs', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1');
      await runBillingReminders(deps());
      const again = await runBillingReminders(deps());
      const laterToday = await runBillingReminders(deps({ now: at(0.5) }));
      expect(mails).toHaveLength(1);
      // Quietly nothing to do — an already-sent reminder is not an error.
      expect(again).toMatchObject({ sent: [], failed: 0 });
      expect(laterToday).toMatchObject({ sent: [], failed: 0 });
    });

    it('moves on through the stages as the date nears — a Standard business gets its fortnight', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1');
      await runBillingReminders(deps({ now: NOW }));
      await runBillingReminders(deps({ now: at(3.5) }));  // about to end: "tomorrow"
      await runBillingReminders(deps({ now: at(5) }));    // ended: dashboard locked
      await runBillingReminders(deps({ now: at(10) }));   // still in the fortnight: nothing new
      await runBillingReminders(deps({ now: at(16.5) }));  // two days before the tills stop
      await runBillingReminders(deps({ now: at(18.5) }));  // 14 days on: tills paused
      expect(mem.reminders.map((r) => r.stage)).toEqual(['soon', 'tomorrow', 'ended', 'pausing', 'paused']);
      expect(mails).toHaveLength(5);
    });

    it('sends only the stage that applies now — a missed "5 days" is not sent late', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 0.5); addOwner('t1');
      const run = await runBillingReminders(deps());
      expect(run.sent).toEqual([{ tenantId: 't1', stage: 'tomorrow', channel: 'email' }]);
    });

    it('starts afresh for the next period once the owner has paid', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1');
      await runBillingReminders(deps());
      addSub('t1', 'standard', 34); // paid: a month on
      expect((await runBillingReminders(deps())).sent).toEqual([]); // nothing due on the new period yet
      await runBillingReminders(deps({ now: at(30) }));
      expect(mem.reminders.map((r) => `${r.periodEnd.getTime() === at(34).getTime() ? 'new' : 'old'}:${r.stage}`)).toEqual(['old:soon', 'new:soon']);
    });

    it('leaves a business that has already renewed alone, even though an old subscription is still in the window', async () => {
      addTenant('t1', { plan: 'standard' });
      addSub('t1', 'standard', 2); addSub('t1', 'standard', 32); // the newer one is what counts
      addOwner('t1');
      expect((await runBillingReminders(deps())).sent).toEqual([]);
      expect(mails).toHaveLength(0);
    });

    it('reminds a trial too', async () => {
      addTenant('t1', { plan: 'trial', trialEndsAt: at(1.5) }); addOwner('t1');
      const run = await runBillingReminders(deps());
      expect(run.sent).toEqual([{ tenantId: 't1', stage: 'soon', channel: 'email' }]);
      expect(mails[0].subject).toContain('free trial');
    });

    it('writes to every owner of the business, claiming the reminder once', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4);
      addOwner('t1', 'a@t1.test'); addOwner('t1', 'b@t1.test');
      await runBillingReminders(deps());
      expect(mails.map((s) => s.to).sort()).toEqual(['a@t1.test', 'b@t1.test']);
      expect(mem.reminders).toHaveLength(1);
    });

    it("keeps businesses apart: one business's reminder is never claimed against another's", async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1');
      addTenant('t2', { plan: 'standard' }); addSub('t2', 'standard', 4); addOwner('t2');
      const run = await runBillingReminders(deps());
      expect(run.sent.map((s) => s.tenantId).sort()).toEqual(['t1', 't2']);
      expect(mails.map((s) => s.to).sort()).toEqual(['owner@t1.test', 'owner@t2.test']);
    });

    it('retries on the next run when the email could not be sent', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1');
      const failing = await runBillingReminders(deps({ send: async () => { throw new Error('Resend is down'); } }));
      expect(failing).toMatchObject({ failed: 1, sent: [] });
      expect(mem.reminders).toHaveLength(0); // the claim was released

      const retry = await runBillingReminders(deps());
      expect(retry.sent).toEqual([{ tenantId: 't1', stage: 'soon', channel: 'email' }]);
    });

    it('one business failing does not stop the others', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1', 'bad@t1.test');
      addTenant('t2', { plan: 'standard' }); addSub('t2', 'standard', 4); addOwner('t2');
      const run = await runBillingReminders(deps({ send: async (to: string) => { if (to.startsWith('bad@')) throw new Error('bounced'); mails.push({ to, subject: '' }); } }));
      expect(run.failed).toBe(1);
      expect(run.sent).toEqual([{ tenantId: 't2', stage: 'soon', channel: 'email' }]);
    });

    it('loses a race to another server gracefully: it was claimed between the check and the claim', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1');
      mem.reminders.push({ tenantId: 't1', periodEnd: at(4), stage: 'soon', channel: 'email' }); // the other server's claim
      mem.hideClaimOnce = true;
      const run = await runBillingReminders(deps());
      expect(run).toMatchObject({ sent: [], failed: 0 });
      expect(mails).toHaveLength(0);
    });

    it('skips a suspended business and one with no owner to write to', async () => {
      addTenant('t1', { plan: 'standard', status: 'suspended' }); addSub('t1', 'standard', 4); addOwner('t1');
      addTenant('t2', { plan: 'standard' }); addSub('t2', 'standard', 4); // no owner
      const run = await runBillingReminders(deps());
      expect(run.sent).toEqual([]);
      expect(mails).toHaveLength(0);
      expect(mem.reminders).toHaveLength(0);
    });
  });

  describe('text messages', () => {
    it('texts an owner who has given a number, as well as emailing — from a day before', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 0.5); addOwner('t1', 'owner@t1.test', '+263771234567');
      const run = await runBillingReminders(deps());
      expect(run.sent.map((s) => s.channel).sort()).toEqual(['email', 'sms']);
      expect(texts).toHaveLength(1);
      expect(texts[0].to).toBe('+263771234567');
      expect(texts[0].body).toContain('due tomorrow');
      expect(texts[0].body).toContain('/settings/payments');
    });

    it('does not text the five-day heads-up — that one is email only (a text costs money)', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1', 'owner@t1.test', '+263771234567');
      const run = await runBillingReminders(deps());
      expect(run.sent).toEqual([{ tenantId: 't1', stage: 'soon', channel: 'email' }]);
      expect(texts).toHaveLength(0);
    });

    it('does not text an owner who has no number', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 0.5); addOwner('t1');
      const run = await runBillingReminders(deps());
      expect(run.sent.map((s) => s.channel)).toEqual(['email']);
      expect(texts).toHaveLength(0);
      expect(mem.reminders.map((r) => r.channel)).toEqual(['email']); // nothing claimed for a text that cannot go
    });

    it('sends each text once, however often it runs', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 0.5); addOwner('t1', 'owner@t1.test', '+263771234567');
      await runBillingReminders(deps());
      await runBillingReminders(deps());
      expect(texts).toHaveLength(1);
      expect(mails).toHaveLength(1);
    });

    it('a text that fails is retried on its own — the email is not sent a second time', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 0.5); addOwner('t1', 'owner@t1.test', '+263771234567');
      const first = await runBillingReminders(deps({ sendText: async () => { throw new Error('gateway down'); } }));
      expect(first).toMatchObject({ failed: 1, sent: [{ tenantId: 't1', stage: 'tomorrow', channel: 'email' }] });

      const retry = await runBillingReminders(deps());
      expect(retry.sent).toEqual([{ tenantId: 't1', stage: 'tomorrow', channel: 'sms' }]);
      expect(mails).toHaveLength(1);
      expect(texts).toHaveLength(1);
    });

    it('an email that fails does not stop the text', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 0.5); addOwner('t1', 'owner@t1.test', '+263771234567');
      const run = await runBillingReminders(deps({ send: async () => { throw new Error('Resend is down'); } }));
      expect(run.failed).toBe(1);
      expect(run.sent).toEqual([{ tenantId: 't1', stage: 'tomorrow', channel: 'sms' }]);
    });

    it('works with texts alone when email is not set up (and the other way round)', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 0.5); addOwner('t1', 'owner@t1.test', '+263771234567');
      expect((await runBillingReminders(deps({ emailConfigured: () => false }))).sent.map((s) => s.channel)).toEqual(['sms']);
      mem.reminders = []; mails.length = 0; texts.length = 0;
      expect((await runBillingReminders(deps({ smsConfigured: () => false }))).sent.map((s) => s.channel)).toEqual(['email']);
      expect(texts).toHaveLength(0);
    });

    it('texts the stages that matter once the period has ended', async () => {
      addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1', 'owner@t1.test', '+263771234567');
      await runBillingReminders(deps({ now: at(5) }));     // ended
      await runBillingReminders(deps({ now: at(16.5) }));  // pausing
      await runBillingReminders(deps({ now: at(18.5) }));  // paused
      expect(texts.map((t) => t.body)).toEqual([
        expect.stringContaining('dashboard is locked'),
        expect.stringContaining('tills pause on'),
        expect.stringContaining('tills have paused'),
      ]);
    });
  });

  it('does nothing — and claims nothing — when neither email nor texts are set up', async () => {
    addTenant('t1', { plan: 'standard' }); addSub('t1', 'standard', 4); addOwner('t1', 'owner@t1.test', '+263771234567');
    const run = await runBillingReminders(deps({ emailConfigured: () => false, smsConfigured: () => false }));
    expect(run).toMatchObject({ skipped: 'no email or SMS provider configured', sent: [] });
    expect(mem.reminders).toHaveLength(0);
  });
});
