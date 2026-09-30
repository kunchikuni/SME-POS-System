# Deploying Wivae to production

Two deployments:

| Part | What it is | Where |
|---|---|---|
| **App server** | One Node process (Hono) serving the API, the dashboard SPA and the till PWA. Built by the `Dockerfile`. | Railway (or any Docker host) |
| **Marketing site** | Fully static Astro site. No server dependency. | Cloudflare Pages / Netlify |

The database is Supabase Postgres (session pooler).

> **Before you start:** read [What is and isn't verified](#what-is-and-isnt-verified)
> and decide the [production database](#3-production-database) question — that
> one is yours to make and everything else assumes it's settled.

## Domain layout

With `wivae.com` standing in for your real domain:

| Address | Serves | Points to |
|---|---|---|
| `wivae.com`, `www.wivae.com` | marketing site | the static host |
| `app.wivae.com` | sign-up (`/register`) and the app's central address | Railway |
| `<shop>.wivae.com` (wildcard `*.wivae.com`) | each business's dashboard, till and sign-in | Railway |

`app` (and `www`, `api`, `admin`, …) are reserved workspace names, so no
business can claim them. Only the **bare** domain and `www` go to the static
host; everything else under the domain goes to Railway. Exact DNS records
(`wivae.com`, `www`, `app`) win over the `*` wildcard automatically.

## 1. App server — Railway

The git repository root is the parent folder of this project, and the project
lives in its `SME-POS/` subfolder. So in Railway:

1. New project → Deploy from GitHub → this repository.
2. **Settings → Root Directory: `SME-POS`.** Without this Railway won't find the
   `Dockerfile` (it builds from the repo root by default).
3. Railway detects the `Dockerfile` — no build or start command needed.
4. Region: pick the one closest to your Supabase project (the pooler host
   name says which, e.g. `aws-1-eu-west-1` = Ireland → EU West). Every API
   call makes several database round trips, so distance to the database is the
   biggest performance lever you have.
5. Add the variables below **before the first deploy**.

### Variables

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Turns on Secure cookies, HTTPS-only CORS and the `APP_KEY` check. |
| `DATABASE_URL` | Supabase **session** pooler string (port 5432) | Must end with `?sslmode=require&uselibpqcompat=true`. Not the transaction pooler (6543) — it breaks Prisma. |
| `APP_KEY` | random 32+ chars | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. The server **refuses to boot** if it is short, looks like a placeholder, or has very few distinct characters. It signs/encrypts sessions and sign-up hand-off tokens — rotating it signs everyone out. |
| `TENANT_DOMAIN` | `wivae.com` | Root domain, no dot, no scheme. |
| `SESSION_DOMAIN` | `.wivae.com` | Leading dot — lets one session cookie work across subdomains. |
| `VITE_TENANT_DOMAIN` | `wivae.com` | **Build-time.** Baked into the dashboard bundle (Vite reads env at compile time). Must equal `TENANT_DOMAIN`. Railway passes service variables to the Docker build as build args. Changing it needs a **rebuild**, not just a restart. If unset the dashboard falls back to `wivae.com`. |
| `TRUSTED_PROXY_HOPS` | `1` (default) | How many proxies in front of the app append to `X-Forwarded-For`. Used for rate limiting. Railway = 1. Put Cloudflare in front as well and set `2`. Too low lets clients spoof their IP; too high locks real users out together. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | from Supabase → Settings → API | Only for product photos / branding uploads. Server-side secret (`service_role` key) — never give it a `VITE_` prefix. Unset = those uploads return a clear error; the rest of the app works. |
| `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` | Paynow dashboard → your integration | Unset = `/payments/subscribe` returns a clean 503 ("Payments are not configured yet"). |
| `APP_SCHEME` | `https` (default) | Used to build Paynow return/result URLs. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SALES_EMAIL` | from resend.com | Only for enquiry-form notification emails. Unset = enquiries still save, the email is skipped. |
| `BUSINESS_UTC_OFFSET_MINUTES` | `120` (default) | "Today" for sales totals and reports uses this fixed offset (Zimbabwe, UTC+2, no DST). Only change it if you operate in another timezone. |
| `PUBLIC_DIR` | *(leave unset)* | Override only if the built SPA/PWA live somewhere other than `public/`. |

`PORT` is set by Railway and read automatically. The container has a health
check on `GET /health`.

Do **not** set `RATE_LIMIT_DISABLED` in production (it exists for tests).

### First deploy

- The image build runs `prisma generate`, then builds the dashboard, the till
  PWA and the server. If the build fails at `prisma generate`, it is a network
  problem reaching Prisma's binary CDN — retry.
- Watch the deploy logs for `APP_KEY looks like a placeholder` (fix the
  variable) or a Prisma connection error (check `DATABASE_URL` and its query
  string).
- Hit `https://<your-railway-domain>/health` — expect `{"ok":true,…}`.

### Custom domains

In Railway → Settings → Networking add **both** `app.wivae.com` and the
wildcard `*.wivae.com`, then create the DNS records Railway shows you. Confirm
your Railway plan allows wildcard domains, and allow time for the wildcard
certificate to issue before you test a workspace address.

## 2. Marketing site — Cloudflare Pages or Netlify

| Setting | Value |
|---|---|
| Root directory | `SME-POS/marketing` |
| Build command | `npm install && npm run build` |
| Output directory | `dist` (relative to the root directory; if your host wants it relative to the repo root, use `SME-POS/marketing/dist`) |

Variables (build-time, like Vite's):

| Variable | Value | Why |
|---|---|---|
| `PUBLIC_APP_URL` | `https://app.wivae.com` | Target of "Start free trial" (`/register`). |
| `PUBLIC_API_URL` | `https://app.wivae.com/api` | A static host has no `/api`; without this the enquiry form and the "Sign in" workspace lookup call the static host and fail. |
| `PUBLIC_TENANT_DOMAIN` | `wivae.com` | "Sign in" sends people to `https://<workspace>.wivae.com/login`. |

The server's CORS allows the root domain and its subdomains over HTTPS, so
marketing on `wivae.com` / `www.wivae.com` can call the API. A preview URL such
as `*.pages.dev` is **not** allowed — the forms only work from the real
domain.

## 3. Production database

This is a decision for you, not a setup step. What to know:

- **Don't point production at the development database.** It holds test data
  (e.g. the `claude-test-shop` business, products with negative stock) from
  development and QA. Use a **new Supabase project** for production.
- The schema is currently applied with `prisma db push` (there is no complete
  migration history — the `prisma/migrations` folder only holds the two
  hand-written SQL files below). Running `migrate deploy` against an empty
  database will **not** create the tables.
- Never run `npm run db:seed` against production. It creates demo businesses.

### Applying the schema to a new, empty database

From your own machine, with `DATABASE_URL` in the root `.env` pointing at the
**production** database (double-check it before each command):

```powershell
npx prisma db push
npx prisma db execute --file prisma/post-push.sql
npx prisma db execute --file prisma/migrations/20260805000001_enable_rls/migration.sql
npx prisma db execute --file prisma/migrations/20260930000001_enable_rls_customers/migration.sql
```

- `post-push.sql` adds a partial unique index Prisma's schema can't express.
- The two RLS files switch on deny-all Row Level Security, so Supabase's
  auto-generated public REST API returns nothing for tenant data. The app
  itself is unaffected **if its database role owns the tables or has
  `BYPASSRLS`** (true for the default Supabase `postgres` role). **Verify this
  after applying**: sign up a test business and confirm the dashboard shows its
  data. If it comes back empty, see the note at the bottom of the first RLS
  file.
- Do **not** run `20260804000001_add_void_requests/migration.sql` after
  `db push` — the table already exists and it would conflict.
- The RLS files are idempotent, so re-running them is harmless.

The development database does not currently have the RLS files applied.

## 4. After it is live

- **Smoke test** on a throwaway business: sign up on `app.wivae.com` →
  you're handed to `<shop>.wivae.com` → add a product → open the till,
  connect it with a PIN → make a cash sale and a credit sale → refresh
  reports.
- **Rate limits** (login, sign-up, enquiries, workspace lookup) are counted
  in memory, per process. They hold for a single instance; if you ever run
  two or more replicas each keeps its own count and you'd need a shared store.
  The sign-up hand-off single-use check has the same single-instance
  assumption.
- **Backups:** turn on Supabase's backups (paid plans include daily backups
  and point-in-time recovery). Nothing in this repo backs the database up.
- **Monitoring:** there is none built in. At minimum point an uptime monitor
  at `/health`.

## Billing

Paynow is wired up (`server/src/lib/paynow.ts`, `server/src/routes/billing.ts`)
but has **not** been exercised against Paynow end to end. Before relying on it,
make a real small test payment and confirm the plan activates.

Paynow's core API is a single-payment flow, not native recurring billing.
Standard/Premium are one-time purchases, which fits. BYOD is priced monthly:
the first payment activates it, but **nothing re-bills it next month** — there
is no scheduler in this app yet.

## What is and isn't verified

Verified in this repository before writing this guide:

- Dashboard, till and server production builds all succeed, and the compiled
  server starts in production mode, serves the dashboard/till and reaches the
  database from a Docker-style layout (`server/dist` + `public/`).
- A 38-step end-to-end walk-through against a real workspace (sign-up,
  catalogue, stock, sales, credit, reports, staff, tenant isolation).
- Rate limits, the `APP_KEY` refusal, and `VITE_TENANT_DOMAIN` handling (set,
  empty and unset).

**Not** verified — check these yourself or expect surprises:

- The Docker image has **never been built** (Docker wasn't running when this
  was prepared). The first Railway build is the first real build.
- Real Paynow payments, wildcard DNS/TLS, and the marketing site's forms
  against a deployed API.
- Till installation as an app, the "update available" notice, receipt
  printing and barcode scanning on real hardware.
- Latency from Railway to Supabase in production. During development,
  round trips from a development laptop varied from one to fifty seconds —
  keep the app and database in the same region and measure.

Known gaps, not addressed here: the ZIMRA taxpayer check is a placeholder,
the 5-staff plan limit is not enforced, there is no automated server test
suite, and the GitHub Actions files under `SME-POS/.github/workflows` do not
run — GitHub only reads `.github/workflows` at the **repository** root, which
is the parent folder of this project. Move them there (adjusting paths for the
`SME-POS/` subfolder) if you want CI.
