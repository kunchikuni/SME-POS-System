# SME-POS-System
# Wivae

Offline-first, multi-tenant point of sale for SMEs.

The design lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — read it first.

## Stack

Laravel 12 · Inertia + React 19 + TypeScript · Tailwind 4 · Supabase Postgres · Redis/Horizon.

## Local setup

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate

# Point *.wivae.test at 127.0.0.1 (hosts file or dnsmasq), then:
php artisan migrate        # applied by you — see "Ways of working" in the arch doc
npm run dev
php artisan serve --host=wivae.test --port=80
```

Visit `http://wivae.test/register`, create a store, and you'll be handed to
`http://<your-subdomain>.wivae.test/login`.

## Ways of working

- No commits to `main`. Feature branches → PR → Cowork review → merge.
- Migrations are committed as files and applied by the team, not by automation.
- One phase per branch. This is `feat/foundation` (Phase 1).

## Phase 1 — what's here

Tenancy spine and the onboarding→dashboard vertical slice:

- Subdomain multi-tenancy (`ResolveTenant`, `TenantContext`, `BelongsToTenant`).
- Tenant signup provisioning tenant + owner + default branch + 7-day trial in one transaction.
- Staff roles (`owner/manager/cashier/waiter`) with an `administer` gate.
- Brand-as-config (`config/brand.php`) — the white-label seam.
- Dashboard shell with trial banner; near-empty dashboard is the Phase 1 exit state.
- Feature tests for the onboarding slice.

Stubbed with clear markers for later phases: catalog/inventory (Phase 2),
the POS PWA + sync (Phase 3), Fortify wiring is expected from the standard
install (login page, sessions/password-reset tables).
