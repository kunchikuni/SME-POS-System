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

## Faster workflow: `bin/wivae`

A guarded helper so the team rules are enforced by the tool, not by memory. It
never commits or pushes to `main`, never commits secrets, and never touches the
database — it only moves files and opens PRs for Cowork.

```bash
bin/wivae new catalog          # start feat/catalog off the latest main
#  …edit files…
bin/wivae ship "add catalog"   # commit + push + open a PR for review

# or step by step:
bin/wivae save "message" [paths…]
bin/wivae push
bin/wivae pr "title"
bin/wivae status
```

Optional, so PRs auto-request the reviewer:

```bash
export COWORK_REVIEWER=<github-handle-or-team>   # e.g. in your shell profile
```

Requires the GitHub CLI (`gh`) for one-command PRs; without it, `pr` prints a
compare link to open the PR by hand. Windows: run under WSL or Git Bash. Add an
alias if you like: `alias wivae="./bin/wivae"`.
