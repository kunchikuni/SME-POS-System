/**
 * Preflight: is this environment and database ready for real customers?
 *
 * DEPLOY.md is a list of manual steps, and several of the ways to get one wrong are
 * quiet: a missing RLS file leaves tenant data readable through Supabase's public
 * API, an old unique index lets a business have exactly one cashier, no
 * BILLING_REMINDERS means owners are locked out without a word of warning, and an
 * unset EMAIL_FROM sends mail from a placeholder address the provider rejects.
 * Nothing crashes, so nothing tells you. This does.
 *
 * It only READS. The checks are plain functions of their input -- an environment
 * object, and a function that runs a SELECT -- so they are tested without a
 * database (preflight.test.ts) and run for real by `npm run preflight`
 * (src/preflight.ts). Secret values are never put in a finding, only whether they
 * are set and sane.
 */
import { appKeyProblem } from './appKey.js';

export type Level = 'ok' | 'warn' | 'fail';

export interface Finding {
  level: Level;
  area: 'Environment' | 'Database';
  message: string;
  /** What to do about it (absent on a pass). */
  fix?: string;
}

type Env = Record<string, string | undefined>;

const ok = (area: Finding['area'], message: string): Finding => ({ level: 'ok', area, message });
const warn = (area: Finding['area'], message: string, fix: string): Finding => ({ level: 'warn', area, message, fix });
const fail = (area: Finding['area'], message: string, fix: string): Finding => ({ level: 'fail', area, message, fix });

const set = (v: string | undefined): v is string => typeof v === 'string' && v.trim() !== '';

/** A root domain as TENANT_DOMAIN wants it: "wivae.com" -- no scheme, port, path or leading dot, and not a local name. */
function rootDomainProblem(domain: string): string | null {
  if (/[:/\s]/.test(domain)) return 'it has a scheme, port or path in it';
  if (domain.startsWith('.')) return 'it starts with a dot (that belongs on SESSION_DOMAIN, not here)';
  if (!domain.includes('.')) return 'it is not a real domain';
  if (/(^|\.)(localhost|test|local|invalid|example)$/i.test(domain)) return 'it is a local or reserved name';
  return null;
}

/** Whether SMS is fully set up, by the rules of lib/sms.ts (preflight.test.ts keeps the two in step). */
export function smsReady(env: Env): boolean {
  const provider = (env.SMS_PROVIDER ?? 'twilio').toLowerCase();
  return (
    provider === 'twilio' &&
    set(env.TWILIO_ACCOUNT_SID) &&
    set(env.TWILIO_AUTH_TOKEN) &&
    (set(env.TWILIO_FROM) || set(env.TWILIO_MESSAGING_SERVICE_SID))
  );
}

export function checkEnvironment(env: Env): Finding[] {
  const A = 'Environment';
  const out: Finding[] = [];

  // ── Mode
  if (env.NODE_ENV === 'production') out.push(ok(A, 'NODE_ENV is production'));
  else {
    out.push(fail(A, `NODE_ENV is ${set(env.NODE_ENV) ? `"${env.NODE_ENV}"` : 'not set'}, not "production": session cookies would not be Secure and the APP_KEY check would be off`,
      'Set NODE_ENV=production.'));
  }

  // ── Database connection string
  if (!set(env.DATABASE_URL)) {
    out.push(fail(A, 'DATABASE_URL is not set', 'Set it to the Supabase SESSION pooler string (port 5432).'));
  } else {
    let url: URL | null = null;
    try { url = new URL(env.DATABASE_URL); } catch { /* reported below */ }
    if (!url) out.push(fail(A, 'DATABASE_URL is not a valid connection string', 'Copy it again from Supabase → Project Settings → Database (Session pooler, "Prisma" format).'));
    else if (url.port === '6543') out.push(fail(A, 'DATABASE_URL points at the transaction pooler (port 6543), which breaks Prisma', 'Use the SESSION pooler string, port 5432.'));
    else if (!/sslmode=require/i.test(url.search)) out.push(warn(A, 'DATABASE_URL has no sslmode=require', 'End it with ?sslmode=require&uselibpqcompat=true.'));
    else out.push(ok(A, 'DATABASE_URL looks right (session pooler, TLS required)'));
  }

  // ── The key that signs every session and sign-up link
  const keyProblem = appKeyProblem(env.APP_KEY);
  if (keyProblem) out.push(fail(A, `${keyProblem.split(' — refusing')[0]}: the server will refuse to start`,
    "Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""));
  else out.push(ok(A, 'APP_KEY is long and random enough'));

  // ── Domain and cookies
  const domain = env.TENANT_DOMAIN;
  let domainOk = false;
  if (!set(domain)) out.push(fail(A, 'TENANT_DOMAIN is not set', 'Set it to your root domain, e.g. wivae.com.'));
  else {
    const problem = rootDomainProblem(domain);
    if (problem) out.push(fail(A, `TENANT_DOMAIN "${domain}" is wrong: ${problem}`, 'It should be the bare root domain, e.g. wivae.com.'));
    else { domainOk = true; out.push(ok(A, `TENANT_DOMAIN is ${domain}`)); }
  }
  if (domainOk) {
    if (!set(env.SESSION_DOMAIN)) out.push(warn(A, 'SESSION_DOMAIN is not set, so a sign-in cookie is tied to one address instead of every workspace', `Set SESSION_DOMAIN=.${domain}`));
    else if (env.SESSION_DOMAIN !== `.${domain}`) out.push(warn(A, `SESSION_DOMAIN is "${env.SESSION_DOMAIN}", not ".${domain}"`, `Set SESSION_DOMAIN=.${domain}`));
    else out.push(ok(A, 'SESSION_DOMAIN covers every workspace address'));

    if (set(env.VITE_TENANT_DOMAIN) && env.VITE_TENANT_DOMAIN !== domain) {
      out.push(fail(A, `VITE_TENANT_DOMAIN ("${env.VITE_TENANT_DOMAIN}") differs from TENANT_DOMAIN ("${domain}"): the dashboard would send people to the wrong address`,
        'Make them equal and REBUILD (it is baked in at build time).'));
    } else if (!set(env.VITE_TENANT_DOMAIN) && domain !== 'wivae.com') {
      out.push(warn(A, 'VITE_TENANT_DOMAIN is not set, so the dashboard falls back to wivae.com', `Set VITE_TENANT_DOMAIN=${domain} and rebuild.`));
    }
  }
  if (set(env.APP_SCHEME) && env.APP_SCHEME !== 'https') out.push(fail(A, `APP_SCHEME is "${env.APP_SCHEME}": Paynow's return and result links would be http`, 'Remove it (the default is https) or set APP_SCHEME=https.'));

  // ── Taking money
  const hasId = set(env.PAYNOW_INTEGRATION_ID), hasKey = set(env.PAYNOW_INTEGRATION_KEY);
  if (hasId && hasKey) out.push(ok(A, 'Paynow credentials are set'));
  else if (hasId || hasKey) out.push(fail(A, `Only ${hasId ? 'PAYNOW_INTEGRATION_ID' : 'PAYNOW_INTEGRATION_KEY'} is set`, 'Set both, from your integration in the Paynow dashboard.'));
  else out.push(fail(A, 'Paynow credentials are not set: nobody can pay, so every business is locked out when its trial ends',
    'Set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY.'));

  // ── Warning owners before they are locked out
  const email = set(env.RESEND_API_KEY);
  const sms = smsReady(env);
  const twilioParts = [env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM ?? env.TWILIO_MESSAGING_SERVICE_SID].filter(set).length;
  if (env.BILLING_REMINDERS !== 'on') {
    out.push(warn(A, 'BILLING_REMINDERS is not "on": owners get no email or text before their plan runs out, and are simply locked out',
      'Set BILLING_REMINDERS=on and at least one of RESEND_API_KEY / the TWILIO_* settings.'));
  } else if (!email && !sms) {
    out.push(fail(A, 'BILLING_REMINDERS is on but no email or SMS provider is set, so no reminder can go out', 'Set RESEND_API_KEY (+ EMAIL_FROM) and/or SMS_PROVIDER with the TWILIO_* settings.'));
  } else if (email && sms) {
    out.push(ok(A, 'Billing reminders are on, by email and text'));
  } else {
    // The pricing page and FAQ promise reminders "by email and text" (marketing/src/components/Pricing.tsx, islands/FaqAccordion.tsx).
    out.push(warn(A, `Billing reminders are on, but by ${email ? 'email' : 'text'} only: the pricing page and FAQ promise "by email and text", so owners are promised a ${email ? 'text' : 'email'} they will not get`,
      email
        ? 'Set SMS_PROVIDER and the TWILIO_* settings (owners also have to have given a mobile number), or change the wording on the pricing page and FAQ.'
        : 'Set RESEND_API_KEY and EMAIL_FROM, or change the wording on the pricing page and FAQ.'));
  }
  if (!sms && twilioParts > 0) out.push(warn(A, 'The Twilio settings are incomplete, so texts will not be sent', 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID).'));
  if (set(env.SMS_PROVIDER) && env.SMS_PROVIDER.toLowerCase() !== 'twilio') out.push(warn(A, `SMS_PROVIDER "${env.SMS_PROVIDER}" is not one this server knows (only "twilio")`, 'Use twilio, or add an adapter in server/src/lib/sms.ts.'));
  if (email) {
    // lib/email.ts falls back to "Wivae <notifications@wivae.test>" when EMAIL_FROM is unset
    if (!set(env.EMAIL_FROM) || /\.(test|invalid|example)>?\s*$/i.test(env.EMAIL_FROM)) {
      out.push(fail(A, `EMAIL_FROM is ${set(env.EMAIL_FROM) ? `"${env.EMAIL_FROM}"` : 'not set'}: mail would go out from a placeholder address your email provider rejects`,
        'Set EMAIL_FROM to an address on a domain you have verified with Resend, e.g. "Wivae <notifications@wivae.com>".'));
    } else out.push(ok(A, 'EMAIL_FROM is a real sender address'));
  }

  // ── Safety and tuning
  if (set(env.RATE_LIMIT_DISABLED) && !/^(0|false|off|no)$/i.test(env.RATE_LIMIT_DISABLED)) {
    out.push(fail(A, 'RATE_LIMIT_DISABLED is set: sign-in, sign-up and the public forms have no attempt limits', 'Remove it (it exists for tests).'));
  }
  if (set(env.TRUSTED_PROXY_HOPS) && !/^[1-9]\d*$/.test(env.TRUSTED_PROXY_HOPS)) {
    out.push(fail(A, `TRUSTED_PROXY_HOPS is "${env.TRUSTED_PROXY_HOPS}", not a whole number of 1 or more`, 'Railway alone = 1; with Cloudflare in front = 2.'));
  }
  if (set(env.BUSINESS_UTC_OFFSET_MINUTES) && !/^-?\d+$/.test(env.BUSINESS_UTC_OFFSET_MINUTES)) {
    out.push(fail(A, `BUSINESS_UTC_OFFSET_MINUTES is "${env.BUSINESS_UTC_OFFSET_MINUTES}", not a whole number`, 'Zimbabwe (UTC+2) is 120.'));
  }
  if (!set(env.SUPABASE_URL) || !set(env.SUPABASE_SERVICE_KEY)) {
    out.push(warn(A, 'SUPABASE_URL / SUPABASE_SERVICE_KEY are not both set: product photos and branding uploads will fail (everything else works)', 'Set both, from Supabase → Settings → API (the service_role key; never give it a VITE_ prefix).'));
  }
  return out;
}

/** Runs one SELECT and returns its rows. */
export type Query = (sql: string) => Promise<Record<string, unknown>[]>;

/** Tables a working install must have. */
const CORE_TABLES = ['tenants', 'users', 'subscriptions', 'billing_reminders', 'void_requests', 'sales', 'devices', 'tasks'];

const RLS_FILES = [
  'Run these three, in order (they are safe to re-run):',
  'npx prisma db execute --file prisma/migrations/20260805000001_enable_rls/migration.sql',
  'npx prisma db execute --file prisma/migrations/20260930000001_enable_rls_customers/migration.sql',
  'npx prisma db execute --file prisma/migrations/20261002000001_enable_rls_billing_reminders/migration.sql',
].join('\n');

/** Subdomains the dev seed and QA left behind: DEPLOY.md says production must not carry them. */
const DEV_SUBDOMAINS = ['demo', 'claude-test-shop'];

export async function checkDatabase(query: Query): Promise<Finding[]> {
  const A = 'Database';
  const out: Finding[] = [];

  let me: { u: string; d: string };
  try {
    const [row] = await query('SELECT current_user AS u, current_database() AS d');
    me = { u: String(row?.u), d: String(row?.d) };
    out.push(ok(A, `Connected to database "${me.d}" as "${me.u}"`));
  } catch (e) {
    const why = (e instanceof Error ? e.message : String(e)).split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error';
    return [fail(A, `Cannot connect: ${why}`, 'Check DATABASE_URL (session pooler, port 5432, ?sslmode=require&uselibpqcompat=true) and that the Supabase project is not paused.')];
  }

  const tables = new Set((await query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).map((r) => String(r.table_name)));
  const missingTables = CORE_TABLES.filter((t) => !tables.has(t));
  if (missingTables.length) {
    out.push(fail(A, `The schema is not applied: missing table${missingTables.length > 1 ? 's' : ''} ${missingTables.join(', ')}`,
      'From your machine, with DATABASE_URL in the root .env pointing at this database: npx prisma db push  (then the steps in DEPLOY.md §3).'));
    return out; // everything below would only repeat that
  }
  out.push(ok(A, 'Core tables exist'));

  // Columns added after the first schema: an older database is missing them, and the features that use them fail quietly.
  const cols = new Set((await query(
    `SELECT table_name || '.' || column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'users' AND column_name = 'phone') OR (table_name = 'subscriptions' AND column_name IN ('provider_ref', 'poll_url')))`,
  )).map((r) => String(r.c)));
  const wantedCols: [string, string][] = [
    ['users.phone', 'Billing reminder texts need a phone number to send to.'],
    ['subscriptions.provider_ref', 'Payments cannot be matched to a plan.'],
    ['subscriptions.poll_url', '"Check my payment" cannot ask Paynow about a lost confirmation.'],
  ];
  const missingCols = wantedCols.filter(([c]) => !cols.has(c));
  if (missingCols.length) {
    out.push(fail(A, `Missing column${missingCols.length > 1 ? 's' : ''}: ${missingCols.map(([c]) => c).join(', ')}. ${missingCols.map(([, why]) => why).join(' ')}`,
      'Apply the schema: npx prisma db push (users.phone and billing_reminders also have prisma/migrations/20261001000001_billing_reminders/migration.sql).'));
  } else out.push(ok(A, 'Payment and reminder columns exist'));

  // Indexes Prisma's schema cannot express.
  const idx = new Map((await query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('users_tenant_id_email_key', 'void_requests_one_pending_per_sale')`,
  )).map((r) => [String(r.indexname), String(r.indexdef)]));
  const emailIdx = idx.get('users_tenant_id_email_key');
  if (!emailIdx || !/\bWHERE\b/i.test(emailIdx)) {
    out.push(fail(A, emailIdx
      ? 'users_tenant_id_email_key is a plain unique index: a business can have only ONE till-only staff account (the second fails)'
      : 'users_tenant_id_email_key is missing: nothing stops two logins sharing an email',
    'npx prisma db execute --file prisma/migrations/20261019000001_users_email_partial_unique/migration.sql'));
  } else out.push(ok(A, 'Login emails are unique per business, and till-only staff can be many'));
  if (!idx.get('void_requests_one_pending_per_sale')) {
    out.push(fail(A, 'void_requests_one_pending_per_sale is missing: a sale could have two void requests pending at once', 'npx prisma db execute --file prisma/post-push.sql'));
  } else out.push(ok(A, 'One pending void per sale is enforced'));

  // Row Level Security: deny-all on every tenant table, so Supabase's public REST API shows nothing.
  const tenantTables = await query(
    `SELECT c.relname AS t, c.relrowsecurity AS rls, pg_get_userbyid(c.relowner) = current_user AS owned
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'tenant_id')
      ORDER BY c.relname`,
  );
  const exposed = tenantTables.filter((r) => r.rls !== true).map((r) => String(r.t));
  if (exposed.length) {
    out.push(fail(A, `Row Level Security is OFF on ${exposed.length} tenant table${exposed.length > 1 ? 's' : ''} (${exposed.join(', ')}): Supabase's public REST API can serve one business's data to anyone with the project's public key`, RLS_FILES));
  } else out.push(ok(A, `Row Level Security is on for all ${tenantTables.length} tenant tables`));

  // With RLS on, the app only sees rows if its role owns the tables or bypasses RLS (the default Supabase "postgres" role does).
  const [role] = await query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
  const bypasses = role?.rolsuper === true || role?.rolbypassrls === true;
  const notOwned = tenantTables.filter((r) => r.rls === true && r.owned !== true).map((r) => String(r.t));
  if (!bypasses && notOwned.length) {
    out.push(fail(A, `The app's database role "${me.u}" neither owns ${notOwned.length > 3 ? `${notOwned.length} tenant tables` : notOwned.join(', ')} nor bypasses RLS: every query would come back EMPTY`,
      'Connect as the table owner (the default postgres role), or grant the role BYPASSRLS. See the note at the bottom of the first RLS migration.'));
  } else out.push(ok(A, 'The app\'s database role can read its own tables through RLS'));

  // Development leftovers.
  const leftovers = await query(
    `SELECT subdomain FROM tenants WHERE deleted_at IS NULL AND (subdomain IN (${DEV_SUBDOMAINS.map((s) => `'${s}'`).join(', ')}) OR name LIKE '%(temporary)')`,
  );
  if (leftovers.length) {
    out.push(warn(A, `This database holds development data (${leftovers.map((r) => String(r.subdomain)).join(', ')}): is it really the production one?`,
      'Production should be a fresh Supabase project (DEPLOY.md §3). Never run db:seed against it.'));
  } else out.push(ok(A, 'No development businesses in it'));

  return out;
}

const MARK: Record<Level, string> = { ok: '[ ok ]', warn: '[warn]', fail: '[FAIL]' };

/** The report: a line per finding, a fix under each problem, and a verdict. */
export function renderReport(findings: Finding[]): string {
  const lines = ['Wivae preflight — checks this environment against DEPLOY.md. It only reads; nothing is changed.', ''];
  for (const area of ['Environment', 'Database'] as const) {
    const mine = findings.filter((f) => f.area === area);
    if (!mine.length) continue;
    lines.push(area);
    // problems first: that is what the reader came for
    for (const f of [...mine].sort((a, b) => rank(b.level) - rank(a.level))) {
      lines.push(`  ${MARK[f.level]} ${f.message}`);
      if (f.fix) f.fix.split('\n').forEach((l, i) => lines.push(i === 0 ? `         → ${l}` : `           ${l}`));
    }
    lines.push('');
  }
  const n = (l: Level) => findings.filter((f) => f.level === l).length;
  lines.push(
    n('fail') ? `NOT READY: ${n('fail')} to fix${n('warn') ? `, ${n('warn')} to consider` : ''} (${n('ok')} fine).`
    : n('warn') ? `Ready, with ${n('warn')} thing${n('warn') > 1 ? 's' : ''} to consider (${n('ok')} fine).`
    : `Ready: all ${n('ok')} checks pass.`,
  );
  return lines.join('\n');
}

const rank = (l: Level) => (l === 'fail' ? 2 : l === 'warn' ? 1 : 0);

export const isReady = (findings: Finding[]) => !findings.some((f) => f.level === 'fail');
