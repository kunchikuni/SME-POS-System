import { afterEach, describe, expect, it } from 'vitest';
import { checkDatabase, checkEnvironment, isReady, renderReport, smsReady, type Query } from './preflight.js';
import { smsConfigured } from './sms.js';
import { appKeyProblem } from './appKey.js';

const KEY = 'q7Lw3vKx9Zr2NpTb8HdYf5GcMs1JuAe4+/=Xo';

/** A production environment with everything set properly: the baseline every case bends one thing in. */
const good = (): Record<string, string> => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://postgres.abc:pw@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true',
  APP_KEY: KEY,
  TENANT_DOMAIN: 'wivae.com',
  SESSION_DOMAIN: '.wivae.com',
  PAYNOW_INTEGRATION_ID: '1234',
  PAYNOW_INTEGRATION_KEY: 'k-5678',
  BILLING_REMINDERS: 'on',
  RESEND_API_KEY: 're_abc',
  EMAIL_FROM: 'Wivae <notifications@wivae.com>',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_KEY: 'svc',
});

const levels = (env: Record<string, string | undefined>) => checkEnvironment(env).filter((f) => f.level !== 'ok');
const problem = (env: Record<string, string | undefined>, text: RegExp) => checkEnvironment(env).find((f) => f.level !== 'ok' && text.test(f.message));

describe('checkEnvironment', () => {
  it('a properly configured production environment has nothing to report', () => {
    expect(levels(good())).toEqual([]);
  });

  it('is not production', () => {
    expect(problem({ ...good(), NODE_ENV: 'development' }, /NODE_ENV/)?.level).toBe('fail');
    expect(problem({ ...good(), NODE_ENV: undefined }, /NODE_ENV/)?.level).toBe('fail');
  });

  it('DATABASE_URL: missing, unreadable, transaction pooler, no TLS', () => {
    expect(problem({ ...good(), DATABASE_URL: undefined }, /DATABASE_URL is not set/)?.level).toBe('fail');
    expect(problem({ ...good(), DATABASE_URL: 'not a url' }, /not a valid/)?.level).toBe('fail');
    expect(problem({ ...good(), DATABASE_URL: good().DATABASE_URL.replace(':5432', ':6543') }, /transaction pooler/)?.level).toBe('fail');
    expect(problem({ ...good(), DATABASE_URL: good().DATABASE_URL.replace('?sslmode=require&uselibpqcompat=true', '') }, /sslmode/)?.level).toBe('warn');
  });

  it('APP_KEY: the placeholder from .env.example, a short key and a repetitive one are refused, as the server itself would', () => {
    for (const bad of ['change-me-to-a-32-character-random-string!!', 'short', 'a'.repeat(40), undefined]) {
      expect(appKeyProblem(bad)).not.toBeNull();
      expect(problem({ ...good(), APP_KEY: bad }, /APP_KEY/)?.level, String(bad)).toBe('fail');
    }
    expect(appKeyProblem(KEY)).toBeNull();
  });

  it('TENANT_DOMAIN must be a bare, real root domain', () => {
    expect(problem({ ...good(), TENANT_DOMAIN: undefined }, /TENANT_DOMAIN is not set/)?.level).toBe('fail');
    for (const bad of ['https://wivae.com', 'wivae.com:3000', '.wivae.com', 'wivae', 'localhost', 'wivae.test', 'app.localhost']) {
      expect(problem({ ...good(), TENANT_DOMAIN: bad, SESSION_DOMAIN: undefined }, /TENANT_DOMAIN/)?.level, bad).toBe('fail');
    }
  });

  it('SESSION_DOMAIN should be the root domain with a leading dot', () => {
    expect(problem({ ...good(), SESSION_DOMAIN: undefined }, /SESSION_DOMAIN/)?.fix).toContain('.wivae.com');
    expect(problem({ ...good(), SESSION_DOMAIN: 'wivae.com' }, /SESSION_DOMAIN/)?.level).toBe('warn');
  });

  it('VITE_TENANT_DOMAIN: a mismatch is a failure; unset is fine only for wivae.com', () => {
    expect(problem({ ...good(), VITE_TENANT_DOMAIN: 'other.com' }, /VITE_TENANT_DOMAIN/)?.level).toBe('fail');
    expect(levels({ ...good(), VITE_TENANT_DOMAIN: 'wivae.com' })).toEqual([]);
    const other = { ...good(), TENANT_DOMAIN: 'shopfront.co.zw', SESSION_DOMAIN: '.shopfront.co.zw' };
    expect(problem(other, /VITE_TENANT_DOMAIN/)?.level).toBe('warn');
  });

  it('an http APP_SCHEME would put http links into Paynow requests', () => {
    expect(problem({ ...good(), APP_SCHEME: 'http' }, /APP_SCHEME/)?.level).toBe('fail');
    expect(levels({ ...good(), APP_SCHEME: 'https' })).toEqual([]);
  });

  it('Paynow: neither or only one credential is a failure, because nobody could pay', () => {
    expect(problem({ ...good(), PAYNOW_INTEGRATION_ID: undefined, PAYNOW_INTEGRATION_KEY: undefined }, /nobody can pay/)?.level).toBe('fail');
    expect(problem({ ...good(), PAYNOW_INTEGRATION_KEY: undefined }, /Only PAYNOW_INTEGRATION_ID/)?.level).toBe('fail');
    expect(problem({ ...good(), PAYNOW_INTEGRATION_ID: undefined }, /Only PAYNOW_INTEGRATION_KEY/)?.level).toBe('fail');
  });

  describe('billing reminders', () => {
    it('off is a warning (owners are locked out unwarned), not a failure', () => {
      expect(problem({ ...good(), BILLING_REMINDERS: undefined }, /BILLING_REMINDERS/)?.level).toBe('warn');
      expect(problem({ ...good(), BILLING_REMINDERS: 'yes' }, /BILLING_REMINDERS/)?.level).toBe('warn'); // only "on" turns it on
    });

    it('on with no way to send is a failure', () => {
      const none = { ...good(), RESEND_API_KEY: undefined, EMAIL_FROM: undefined };
      expect(problem(none, /no email or SMS provider/)?.level).toBe('fail');
    });

    it('email alone, or text alone, is enough', () => {
      expect(levels(good())).toEqual([]);
      const textOnly = { ...good(), RESEND_API_KEY: undefined, EMAIL_FROM: undefined, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+15551234567' };
      expect(levels(textOnly)).toEqual([]);
    });

    it('an unset or placeholder EMAIL_FROM is a failure when email is on: the default sender is wivae.test', () => {
      expect(problem({ ...good(), EMAIL_FROM: undefined }, /EMAIL_FROM/)?.level).toBe('fail');
      expect(problem({ ...good(), EMAIL_FROM: 'Wivae <notifications@wivae.test>' }, /EMAIL_FROM/)?.level).toBe('fail');
      expect(problem({ ...good(), EMAIL_FROM: 'notifications@wivae.com' }, /EMAIL_FROM/)).toBeUndefined();
    });

    it('half-set Twilio settings, and an unknown provider, are called out', () => {
      expect(problem({ ...good(), TWILIO_ACCOUNT_SID: 'AC1' }, /Twilio settings are incomplete/)?.level).toBe('warn');
      expect(problem({ ...good(), SMS_PROVIDER: 'clickatell' }, /SMS_PROVIDER/)?.level).toBe('warn');
    });
  });

  it('RATE_LIMIT_DISABLED, a bad proxy hop count and a bad UTC offset are failures', () => {
    expect(problem({ ...good(), RATE_LIMIT_DISABLED: 'true' }, /RATE_LIMIT_DISABLED/)?.level).toBe('fail');
    expect(problem({ ...good(), RATE_LIMIT_DISABLED: 'false' }, /RATE_LIMIT_DISABLED/)).toBeUndefined();
    expect(problem({ ...good(), TRUSTED_PROXY_HOPS: '0' }, /TRUSTED_PROXY_HOPS/)?.level).toBe('fail');
    expect(problem({ ...good(), TRUSTED_PROXY_HOPS: 'two' }, /TRUSTED_PROXY_HOPS/)?.level).toBe('fail');
    expect(problem({ ...good(), TRUSTED_PROXY_HOPS: '2' }, /TRUSTED_PROXY_HOPS/)).toBeUndefined();
    expect(problem({ ...good(), BUSINESS_UTC_OFFSET_MINUTES: '2h' }, /BUSINESS_UTC_OFFSET/)?.level).toBe('fail');
    expect(problem({ ...good(), BUSINESS_UTC_OFFSET_MINUTES: '120' }, /BUSINESS_UTC_OFFSET/)).toBeUndefined();
  });

  it('missing Supabase storage settings only warn: the rest of the app works', () => {
    expect(problem({ ...good(), SUPABASE_SERVICE_KEY: undefined }, /SUPABASE/)?.level).toBe('warn');
  });

  it('never repeats a secret in what it says', () => {
    const env = { ...good(), PAYNOW_INTEGRATION_KEY: 'SUPER-SECRET-PAYNOW', RESEND_API_KEY: 'SUPER-SECRET-RESEND', EMAIL_FROM: 'x@wivae.test', SESSION_DOMAIN: 'wrong' };
    const text = JSON.stringify(checkEnvironment({ ...env, APP_KEY: 'change-me-SUPER-SECRET-KEY-aaaaaaaaaaaaaaaaaaaa' }));
    for (const secret of ['SUPER-SECRET-PAYNOW', 'SUPER-SECRET-RESEND', 'SUPER-SECRET-KEY', 'pw@aws']) expect(text).not.toContain(secret);
  });
});

describe('smsReady keeps the same rules as lib/sms.ts', () => {
  const KEYS = ['SMS_PROVIDER', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'TWILIO_MESSAGING_SERVICE_SID'];
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  const cases: Record<string, string>[] = [
    {},
    { TWILIO_ACCOUNT_SID: 'AC1' },
    { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' },
    { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+1555' },
    { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_MESSAGING_SERVICE_SID: 'MG1' },
    { SMS_PROVIDER: 'TWILIO', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+1555' },
    { SMS_PROVIDER: 'clickatell', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+1555' },
  ];
  it.each(cases.map((c, i) => [i, c] as const))('case %i', (_i, c) => {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, c);
    expect(smsReady(c)).toBe(smsConfigured());
  });
});

/** A fake database: answers each query by recognising what it is asking, from a description of the state. */
interface Db {
  connect?: boolean;
  tables?: string[];
  columns?: string[]; // "table.column"
  indexes?: Record<string, string>;
  tenantTables?: { t: string; rls: boolean; owned: boolean }[];
  role?: { rolsuper: boolean; rolbypassrls: boolean };
  leftovers?: string[];
}
const HEALTHY: Required<Db> = {
  connect: true,
  tables: ['tenants', 'users', 'subscriptions', 'billing_reminders', 'void_requests', 'sales', 'devices', 'tasks', 'products'],
  columns: ['users.phone', 'subscriptions.provider_ref', 'subscriptions.poll_url'],
  indexes: {
    users_tenant_id_email_key: 'CREATE UNIQUE INDEX users_tenant_id_email_key ON public.users USING btree (tenant_id, email) WHERE (email <> \'\'::text)',
    void_requests_one_pending_per_sale: "CREATE UNIQUE INDEX void_requests_one_pending_per_sale ON public.void_requests USING btree (sale_id) WHERE (status = 'pending'::text)",
  },
  tenantTables: [{ t: 'users', rls: true, owned: true }, { t: 'sales', rls: true, owned: true }, { t: 'billing_reminders', rls: true, owned: true }],
  role: { rolsuper: false, rolbypassrls: true },
  leftovers: [],
};
const fakeDb = (over: Db = {}): Query => {
  const s = { ...HEALTHY, ...over };
  return async (sql) => {
    if (/current_user AS u/.test(sql)) {
      if (!s.connect) throw new Error("Can't reach database server at `aws-1-eu-west-1.pooler.supabase.com:5432`");
      return [{ u: 'postgres.abc', d: 'postgres' }];
    }
    if (/information_schema\.tables/.test(sql)) return s.tables.map((table_name) => ({ table_name }));
    if (/AS c FROM information_schema\.columns/.test(sql)) return s.columns.map((c) => ({ c }));
    if (/FROM pg_indexes/.test(sql)) return Object.entries(s.indexes).map(([indexname, indexdef]) => ({ indexname, indexdef }));
    if (/relrowsecurity/.test(sql)) return s.tenantTables;
    if (/FROM pg_roles/.test(sql)) return [s.role];
    if (/FROM tenants/.test(sql)) return s.leftovers.map((subdomain) => ({ subdomain }));
    throw new Error('unexpected query: ' + sql.slice(0, 60));
  };
};
const dbProblem = async (over: Db, text: RegExp) => (await checkDatabase(fakeDb(over))).find((f) => f.level !== 'ok' && text.test(f.message));

describe('checkDatabase', () => {
  it('a healthy production database has nothing to report', async () => {
    const found = await checkDatabase(fakeDb());
    expect(found.filter((f) => f.level !== 'ok')).toEqual([]);
    expect(found[0].message).toContain('"postgres"');
  });

  it('cannot connect: one clear failure, and nothing else is attempted', async () => {
    const found = await checkDatabase(fakeDb({ connect: false }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: 'fail' });
    expect(found[0].message).toMatch(/Cannot connect/);
    expect(found[0].fix).toMatch(/paused/);
  });

  it('an empty database: says the schema is not applied, once, and stops', async () => {
    // an empty database has no columns, indexes or tenant tables either: carrying on would pile up failures that all say the same thing
    const found = await checkDatabase(fakeDb({ tables: [], columns: [], indexes: {}, tenantTables: [] }));
    expect(found.filter((f) => f.level === 'fail')).toHaveLength(1);
    expect(found.find((f) => f.level === 'fail')!.message).toMatch(/schema is not applied.*tenants/);
    expect(found.find((f) => f.level === 'fail')!.fix).toMatch(/prisma db push/);
  });

  it('an old database missing the newer tables or columns', async () => {
    expect((await dbProblem({ tables: HEALTHY.tables.filter((t) => t !== 'billing_reminders') }, /billing_reminders/))?.level).toBe('fail');
    const f = await dbProblem({ columns: ['users.phone'] }, /Missing column/);
    expect(f?.level).toBe('fail');
    expect(f?.message).toMatch(/subscriptions\.poll_url/);
    expect(f?.message).toMatch(/Check my payment/);
  });

  it('a plain unique index on login email: a business could have only one cashier', async () => {
    const plain = { ...HEALTHY.indexes, users_tenant_id_email_key: 'CREATE UNIQUE INDEX users_tenant_id_email_key ON public.users USING btree (tenant_id, email)' };
    const f = await dbProblem({ indexes: plain }, /plain unique index/);
    expect(f?.level).toBe('fail');
    expect(f?.fix).toContain('20261019000001_users_email_partial_unique');
    const { users_tenant_id_email_key: _gone, ...without } = HEALTHY.indexes;
    expect((await dbProblem({ indexes: without }, /users_tenant_id_email_key is missing/))?.level).toBe('fail');
  });

  it('no one-pending-void index', async () => {
    const { void_requests_one_pending_per_sale: _gone, ...without } = HEALTHY.indexes;
    expect((await dbProblem({ indexes: without }, /two void requests/))?.fix).toContain('post-push.sql');
  });

  it('Row Level Security off on a tenant table: names it, and says what is exposed', async () => {
    const tenantTables = [{ t: 'users', rls: true, owned: true }, { t: 'sales', rls: false, owned: true }, { t: 'customers', rls: false, owned: true }];
    const f = await dbProblem({ tenantTables }, /Row Level Security is OFF/);
    expect(f?.level).toBe('fail');
    expect(f?.message).toContain('sales, customers');
    expect(f?.message).toMatch(/public key/);
    // all three files, each as its own command, in the order the guide applies them
    const commands = (f?.fix ?? '').split('\n').filter((l) => l.startsWith('npx '));
    expect(commands.map((c) => c.match(/migrations\/(\d+_[a-z_]+)\//)![1])).toEqual([
      '20260805000001_enable_rls', '20260930000001_enable_rls_customers', '20261002000001_enable_rls_billing_reminders',
    ]);
  });

  it('RLS on, but the app role neither owns the tables nor bypasses RLS: every query is empty', async () => {
    const tenantTables = HEALTHY.tenantTables.map((t) => ({ ...t, owned: false }));
    const f = await dbProblem({ tenantTables, role: { rolsuper: false, rolbypassrls: false } }, /EMPTY/);
    expect(f?.level).toBe('fail');
    // the owner needs no bypass, and a bypass role needs no ownership
    expect(await dbProblem({ role: { rolsuper: false, rolbypassrls: false } }, /EMPTY/)).toBeUndefined();
    expect(await dbProblem({ tenantTables, role: { rolsuper: false, rolbypassrls: true } }, /EMPTY/)).toBeUndefined();
    expect(await dbProblem({ tenantTables, role: { rolsuper: true, rolbypassrls: false } }, /EMPTY/)).toBeUndefined();
  });

  it('development businesses in the database are a warning', async () => {
    const f = await dbProblem({ leftovers: ['demo', 'claude-test-shop'] }, /development data/);
    expect(f?.level).toBe('warn');
    expect(f?.message).toContain('demo, claude-test-shop');
  });

  it('only reads: every query is a SELECT', async () => {
    const seen: string[] = [];
    const base = fakeDb();
    await checkDatabase(async (sql) => { seen.push(sql.trim()); return base(sql); });
    expect(seen.length).toBeGreaterThan(5);
    for (const sql of seen) expect(sql, sql).toMatch(/^SELECT\b/i);
  });
});

describe('renderReport', () => {
  it('lists problems first with the fix underneath, and ends in a verdict', () => {
    const report = renderReport([
      ...checkEnvironment({ ...good(), PAYNOW_INTEGRATION_ID: undefined, PAYNOW_INTEGRATION_KEY: undefined, BILLING_REMINDERS: undefined }),
    ]);
    const lines = report.split('\n');
    const firstOk = lines.findIndex((l) => l.includes('[ ok ]'));
    const lastProblem = Math.max(lines.findIndex((l) => l.includes('[warn]')), lines.findIndex((l) => l.includes('[FAIL]')));
    expect(lastProblem).toBeLessThan(firstOk);
    expect(report).toMatch(/\[FAIL\] Paynow credentials are not set[^\n]*\n\s+→ Set PAYNOW_INTEGRATION_ID/);
    expect(report).toMatch(/NOT READY: 1 to fix, 1 to consider/);
  });

  it('says ready when there is nothing to fix', () => {
    const all = checkEnvironment(good());
    expect(isReady(all)).toBe(true);
    expect(renderReport(all)).toMatch(/Ready: all \d+ checks pass\./);
    // a warning is something to consider, not a reason to stop: only a failure makes it "not ready"
    const warned = checkEnvironment({ ...good(), BILLING_REMINDERS: undefined });
    expect(isReady(warned)).toBe(true);
    expect(renderReport(warned)).toMatch(/Ready, with 1 thing to consider/);
    expect(isReady(checkEnvironment({ ...good(), NODE_ENV: 'development' }))).toBe(false);
  });
});
