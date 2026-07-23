# Wivae — complete authored layer (Phases 1–6, 8)

This archive is the **entire hand-authored codebase** as of this build. It
supersedes every previous tarball. Extract it at your Laravel project root
(the folder containing `artisan` and `composer.json`).

## What's inside — and what's deliberately NOT

**Included** (my code):

```
app/          domain services, models, controllers, middleware, providers
config/       ONLY files I author (brand.php, fiscalisation.php) — never auth.php
routes/       web.php (dashboard + POS API + PWA shell)
bootstrap/    app.php (middleware, CSRF exemptions)
database/     23 migrations, seeders, factories
resources/    Inertia dashboard (js/), css/, views/
pos/          the offline-first POS PWA (own Vite build)
package.json  npm deps + scripts
```

**Excluded** (yours / framework — untouched on purpose):

```
config/auth.php   your driver = 'tenant' edit — this file was NEVER in my
                   sandbox, so it cannot be in this zip and cannot be
                   overwritten by extracting it, regardless of extract mode
.env              your environment
vendor/           composer packages
node_modules/     npm packages
database/*.sqlite your data
public/pos/       BUILD OUTPUT — regenerate with `npm run pos:build`
public/build/     BUILD OUTPUT — regenerate with `npm run build`
```

## Install

From the project root (**the directory `php artisan tinker --execute="echo base_path();"` prints**):

```bash
# 1. extract this archive here

# 2. rebuild composer's class index (critical — new PHP files won't load without it)
composer dump-autoload

# 3. install npm deps
npm install

# 4. clear all caches (stale route cache is the #1 cause of 404s)
php artisan optimize:clear

# 5. rebuild the database with demo data
php artisan migrate:fresh --seed

# 6. build BOTH front-ends — this is two separate builds and you need both
npm run build:all
#   npm run build      -> Inertia DASHBOARD -> public/build/   (nav, Analytics,
#                         Branding, Kitchen, Products buttons live here)
#   npm run pos:build  -> offline TILL PWA  -> public/pos/
#
# Skipping `npm run build` is why dashboard changes appear to "do nothing":
# the browser keeps serving the previously compiled bundle.

# 7. serve
php artisan serve --host=0.0.0.0 --port=8000
```

## Required .env

```
APP_URL=http://wivae.test:8000
APP_TENANT_DOMAIN=wivae.test
SESSION_DOMAIN=.wivae.test
SESSION_DRIVER=database
QUEUE_CONNECTION=database
DB_CONNECTION=sqlite

# Only needed to actually test Payments (Settings > Payments) — the page
# loads fine without these, "Pay with Paynow" will fail until they're set.
PAYNOW_INTEGRATION_ID=
PAYNOW_INTEGRATION_KEY=

# Only needed for the Business-tier enquiry notification email — the
# enquiry itself is saved either way (see config/enquiries.php).
SALES_EMAIL=
```

## Composer packages this bundle assumes

Neither is required for the app to boot — only for the specific feature:

```bash
composer require paynow/php-sdk    # Payments (Settings > Payments) — official SDK, confirmed current
composer require doctrine/dbal     # only if `php artisan migrate` errors on a column ->change() call
```

Hosts file needs both entries (no wildcards):

```
127.0.0.1 wivae.test
127.0.0.1 demo.wivae.test
```

## Required config/auth.php

Not shipped (it's yours). Confirm it still reads:

```php
'providers' => [
    'users' => [
        'driver' => 'tenant',   // NOT 'eloquent'
        'model'  => env('AUTH_MODEL', App\Models\User::class),
    ],
],
```

## Seeded demo data

```
Dashboard  http://demo.wivae.test:8000/login
           owner@demo.test / password
Till       http://demo.wivae.test:8000/pos
           device token: demo-device-token
           cashier PIN:  1234
Catalog    8 products (Bread $1.20 … Mazoe 2L $4.00) with opening stock
Tables     7 (restaurant mode only)
```

Restaurant mode (tables + `/kitchen`):

```bash
php artisan tinker
>>> \App\Models\Tenant::where('subdomain','demo')->update(['mode'=>'restaurant']);
```

## Verify it's working

Use a path that CANNOT exist on disk — `/pos` alone is served statically by
`artisan serve` from `public/pos/index.html` and does NOT prove routing works:

```bash
curl -i http://demo.wivae.test:8000/pos/zzz       # expect 200 + PWA HTML  (shell route matched)
curl -i http://demo.wivae.test:8000/pos/session   # expect 401 + {"message":"Missing device token."}
curl -i http://demo.wivae.test:8000/dashboard     # expect 302 (redirect to login)
```

If `/pos/session` 404s, in order:

1. `ls -la bootstrap/cache/` — delete any `routes-v7.php` / `routes.php`, then
   `php artisan optimize:clear` and **restart** `artisan serve`.
2. `php artisan tinker --execute="echo base_path();"` — make sure you extracted
   into THAT directory (a nested `SME-POS-System/SME-POS/` layout is easy to
   get wrong).
3. `composer dump-autoload` — a file present on disk but missing from
   composer's index throws "Class ... does not exist".

## Build status at time of packaging

```
Both builds are required after every extract. Neither depends on test tooling
(pos/tsconfig.json excludes *.test.ts, so a production build works without
vitest installed).

73 PHP files          lint clean (php -l)
POS client            tsc --strict clean
POS tests             27/27 passing (vitest)
Dashboard             tsc clean
POS PWA               builds (service worker + manifest)
```

## Phase status

| Phase | Branch | State |
|---|---|---|
| 1 | feat/foundation | done — tenancy, auth, onboarding, brand-as-config |
| 2 | feat/catalog | done — products, categories, stock ledger, CSV import |
| 3 | feat/pos-offline | done — sync engine, PWA till, outbox, device auth |
| 4 | feat/payments-receipts | code done — ESC/POS + Web Bluetooth; **hardware spike pending** |
| 5 | feat/restaurant | done — tables, kitchen queue, gratuity |
| 6 | feat/analytics | done — overview, top products, dead stock, branches |
| 7 | feat/zimra | spec pinned (v7.2), verifyTaxpayer live — registration/signing not built (see docs §9.2) |
| 8 | feat/billing-whitelabel | white-label done; Paynow billing built on official SDK (see docs §9.1) |
