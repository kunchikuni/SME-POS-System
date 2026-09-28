# Local setup — from a fresh clone to a running system

For deploying to production instead, see [DEPLOY.md](DEPLOY.md). This file
is the local dev / database setup path — every command this session's
debugging actually needed, in the order that works, so a fresh setup
doesn't have to rediscover any of it.

## Prerequisites

- Node.js 22+
- A Supabase project (Postgres). Free tier is fine.

## 1. Install

One command at repo root — npm workspaces installs `server/` and
`marketing/`'s dependencies too, nothing separate needed:

```powershell
npm install
```

## 2. Environment files

Two separate `.env` files, both needed, both from their `.env.example`:

```powershell
copy .env.example .env
copy server\.env.example server\.env
```

Fill in **both** with the same `DATABASE_URL` (Supabase dashboard →
Project Settings → Database → Connection string → **Session pooler** →
**Prisma** format) — see the comments in either `.env.example` for the
exact query-string parameters that matter and why. Also set `APP_KEY` in
both (any random 32+ character string — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

## 3. Database

Run from repo root, in this order:

```powershell
npx prisma generate
npx prisma db push
npx prisma db execute --file prisma/post-push.sql
npm run db:seed
```

What each does:
- **`generate`** — writes the Prisma client to `server/src/generated/prisma`.
  Needs no database connection; only reads `prisma/schema.prisma`.
- **`db push`** — creates every table from the schema directly (this
  project has never used `prisma migrate` / has no migration history —
  `db push` is the established, correct tool here).
- **`db execute --file prisma/post-push.sql`** — one thing `db push` can't
  create: a partial unique index on `void_requests` (Prisma's schema
  syntax can't express partial indexes). **No `--schema` flag** — this
  Prisma version reads schema config from `prisma.config.ts` automatically
  and rejects the flag outright.
- **`db:seed`** — creates the demo tenant/account. Re-runnable safely; it
  skips if the demo tenant already exists. To rebuild from scratch, delete
  the `demo` tenant row (cascades) and re-run.

Seeded login, once this succeeds:
```
URL:      http://demo.localhost:5173/login
Email:    owner@demo.test
Password: password
Till:     http://demo.localhost:5174/pos/   (device token and PINs are printed by the seed)
```

## 4. Workspace addresses (no hosts file needed)

In dev every business lives at `<workspace>.localhost` — `server/.env` has
`TENANT_DOMAIN=localhost`. Chrome, Edge and Firefox send **any**
`*.localhost` name to your own machine, so a workspace created at sign-up
works immediately: no hosts-file entry per workspace, no Administrator edits.

`*.localhost` also counts as a **secure context**, the same as HTTPS. That's
what lets the dashboard and the till be installed as apps in dev — Chrome
shows **Install** in the address bar, then **Open in app** once installed —
and lets the till's offline service worker run. (A plain `http://` custom
domain gets none of that.)

| What | Address |
|---|---|
| Sign up a new business | `http://localhost:5173/register` |
| A workspace's dashboard | `http://<workspace>.localhost:5173` |
| A workspace's till | `http://<workspace>.localhost:5174/pos/` |
| Marketing site | `http://localhost:4321` |

`SESSION_DOMAIN` is left **unset** in dev: browsers refuse a cookie scoped
to `.localhost`, so each workspace has its own sign-in. New owners arrive
signed in anyway — sign-up hands them a one-time link to their workspace.
In production set `TENANT_DOMAIN`, `SESSION_DOMAIN` (`.yourdomain.com`) and
the dashboard's `VITE_TENANT_DOMAIN` to your real domain — see DEPLOY.md.

## 5. Run everything

```powershell
npm run dev:all
```

Starts all four: API (`:3000`), dashboard (`:5173`), POS PWA (`:5174`),
marketing site (`:4321`). Visit `http://demo.localhost:5173/login` for the
dashboard, `http://localhost:4321` for the marketing site.

---

## Troubleshooting — every issue actually hit this session, and its fix

**`'vite' is not recognized` / `'tsc' is not recognized`**
`npm install` hasn't been run (or was run in the wrong folder). Confirm
you're at repo root — `npm run` with no arguments lists available scripts;
if you only see `dev`/`build`/`start`, you're inside `server/` by mistake.

**`P1013: scheme is not recognized`**
`DATABASE_URL` is empty, or a `#` character in the password got treated as
a comment start by `.env`'s parser (wrap the whole value in quotes if your
password has one), or a `<placeholder>` was never replaced with a real
value.

**`P1001: Can't reach database server`**
First, confirm it's not actually a firewall/network problem:
`Test-NetConnection -ComputerName <your-pooler-host> -Port 5432`. If that
succeeds but Prisma still can't connect, it's almost always the TLS/antivirus
issue below, or transient handshake latency — add `&sslmode=require&uselibpqcompat=true`
(and `&connect_timeout=30` if it's still intermittent) to `DATABASE_URL` in
**both** `.env` files, or just retry once or twice.

**`SELF_SIGNED_CERT_IN_CHAIN`**
Antivirus intercepting TLS traffic (very common on Windows — Kaspersky,
Norton, Bitdefender, etc. inject their own root certificate; browsers
trust it automatically via the Windows cert store, Node doesn't). Fixed by
the `uselibpqcompat=true` parameter above. The cleaner permanent fix is an
antivirus exclusion for Node/port 5432, if your software supports it.

**`unknown or unexpected option: --schema`** (on `prisma db execute`)
This Prisma version reads schema config from `prisma.config.ts`
automatically — drop the flag entirely.

**Landing page / dashboard is blank, no visible error**
Check the browser console (F12) first. `Failed to load resource ... 504
(Outdated Optimize Dep)` means Vite's dependency cache is stale (common
after any `package.json` change):
```powershell
Remove-Item -Recurse -Force node_modules\.vite
```
Restart `npm run dev:all` and hard-refresh (Ctrl+Shift+R) a **new** browser
tab, not the one that was already open.

**A workspace address refuses to connect / "can't reach this page"**
Check the port — `http://demo.localhost:5173`, not the bare name (nothing
listens on port 80 in dev). If you're on an old `*.wivae.test` address,
move to `*.localhost` (step 4); the server no longer recognises
`wivae.test` for the dashboard. Tills already paired on an old address
keep syncing (tills are identified by their device token, not the
address), but opening the till on the new address is a new site to the
browser, so pair it once there.

**"No tenant for this host." / "Unknown tenant."**
The API can't match the address to a business: `server/.env`'s
`TENANT_DOMAIN` must be `localhost` in dev, and the workspace name must
exist (sign up at `http://localhost:5173/register`, or run the seed for
`demo`). Restart the API after editing `server/.env` — it's only read at
startup.

**No "Install" / "Open in app" in the address bar**
Browsers only offer to install from a secure context — `localhost`,
`*.localhost` or HTTPS. Use the addresses in step 4. The till and the
dashboard are separate apps (the till's lives under `/pos/`), each
installed on its own.

**Login/API requests fail with `ECONNREFUSED` in the dashboard's terminal
log, repeatedly**
The API process isn't actually running — check the `[api]`-labeled output
specifically (or run `npm run server:dev` alone, isolated, to see its real
startup error without other processes' logs burying it).

**Everything above is fixed but a workspace still won't load**
Confirm `server.allowedHosts` in both `vite.config.ts` and
`pos/vite.config.ts` includes `.localhost` — Vite 6+ rejects requests with
an unrecognized `Host` header, which silently blocks workspace addresses.
Already set in this repo's shipped config; only relevant if you've hand-
edited those files.
