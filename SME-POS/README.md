# Wivae

Offline-first, multi-tenant point of sale for SMEs — retail, restaurant,
hardware and workshop businesses, each on its own subdomain.

The design lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — read it first.

## Stack

| Part | Where | What |
|---|---|---|
| API server | `server/` | Node 22 · Hono · Prisma 7 (`@prisma/adapter-pg`) · Zod · cookie sessions |
| Dashboard | `resources/js/` | React 19 SPA · React Router 7 · Vite 6 · Tailwind 4 |
| Till (POS) | `pos/` | React PWA · Dexie (IndexedDB) · `vite-plugin-pwa` · works offline |
| Marketing site | `marketing/` | Astro 5, fully static |
| Database | `prisma/schema.prisma` | Supabase Postgres (used as plain Postgres) |

One Node process serves the API, the dashboard and the till in production
(see the root `Dockerfile`); the marketing site deploys separately.

## Getting started

Full, step-by-step setup (environment files, database, troubleshooting) is in
**[SETUP.md](SETUP.md)**. The short version:

```bash
npm install
cp .env.example .env && cp server/.env.example server/.env   # then fill in DATABASE_URL + APP_KEY
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev:all
```

`dev:all` starts the API (`:3000`), dashboard (`:5173`), till (`:5174`) and
marketing site (`:4321`). Workspaces live at `<name>.localhost` — no
hosts-file edits:

- Sign up a new business: `http://localhost:5173/register`
- Seeded demo dashboard: `http://demo.localhost:5173/login` (`owner@demo.test` / `password`)
- Demo till: `http://demo.localhost:5174/pos/`

Deploying to production: **[DEPLOY.md](DEPLOY.md)**.

## Common commands

```bash
npm run dev:all        # everything, for local development
npm run pos:test       # till tests (Vitest) — cart, sync engine, PINs, receipts
npm run pos:check      # typecheck the till
npm run build          # typecheck + build the dashboard (to public/)
npm run pos:build      # build the till PWA (to public/pos/)
npm run server:build   # compile the API (to server/dist/)
npm run db:studio      # browse the database
```

## Ways of working

- No commits straight to `main`: feature branch → pull request → review → merge.
- Database changes: edit `prisma/schema.prisma`, then apply with
  `npx prisma db push` — this database has no migration history (see SETUP.md).
  Schema changes are applied by a person, never by automation.
- When a decision in `docs/ARCHITECTURE.md` changes, update it in the same PR.
