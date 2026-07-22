<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\RegisteredTenantController;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\AiInsightsController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\BrandingController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\BarcodeSheetController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\FiscalisationController;
use App\Http\Controllers\ImportProductsController;
use App\Http\Controllers\ImportTemplateController;
use App\Http\Controllers\KitchenController;
use App\Http\Controllers\OrdersController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\Pos\PosController;
use App\Http\Controllers\Pos\SyncController;
use App\Http\Controllers\Pos\TaskController as PosTaskController;
use App\Http\Controllers\PosShellController;
use App\Http\Controllers\ProductExportController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TenantModeController;
use App\Http\Controllers\TransactionsController;
use App\Http\Middleware\ResolveDevice;
use App\Http\Middleware\ResolveTenant;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$rootDomain = config('brand.tenant_domain');

/*
|--------------------------------------------------------------------------
| Central routes — the bare domain (wivae.test / wivae.com)
|--------------------------------------------------------------------------
| Marketing + tenant onboarding. No tenant in context here.
*/
Route::domain($rootDomain)->group(function () {
    Route::get('/', fn () => Inertia::render('Marketing/Home'))->name('home');

    Route::get('/register', [RegisteredTenantController::class, 'create'])->name('register');
    Route::post('/register', [RegisteredTenantController::class, 'store']);
});

// Fallback for local dev server (127.0.0.1 / localhost) when host doesn't match rootDomain
Route::get('/register', [RegisteredTenantController::class, 'create']);
Route::post('/register', [RegisteredTenantController::class, 'store']);

/*
|--------------------------------------------------------------------------
| Tenant routes — any subdomain ({tenant}.wivae.test)
|--------------------------------------------------------------------------
| ResolveTenant binds the tenant from the subdomain. Fortify provides the
| login/logout routes; everything past `auth` is a signed-in staff member.
*/
Route::domain('{tenant}.' . $rootDomain)
    ->middleware(ResolveTenant::class)
    ->group(function () use ($rootDomain) {

        // Tenant root: the natural URL to type. Guests bounce to /login via
        // the auth middleware; signed-in staff land on their dashboard.
        Route::get('/', fn () => redirect('/dashboard'));

        // If someone hits /register on a tenant subdomain, redirect to central signup.
        Route::get('/register', fn () => redirect()->away("//{$rootDomain}/register"));

        // Guests: the tenant login screen (ResolveTenant has set context, so
        // authentication is scoped to this subdomain's tenant).
        Route::middleware('guest')->group(function () {
            Route::get('/login', [AuthenticatedSessionController::class, 'create'])->name('login');
            Route::post('/login', [AuthenticatedSessionController::class, 'store']);
        });

        // Paynow's result-URL callback: no session, no CSRF token (external
        // POST). Still runs through ResolveTenant so it knows which tenant's
        // subscription this is for. CSRF-exempt in bootstrap/app.php.
        Route::post('billing/webhook', [BillingController::class, 'webhook'])->name('billing.webhook');

        Route::middleware('auth')->group(function () {
            Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');

            Route::get('/dashboard', [DashboardController::class, 'index'])
                ->name('dashboard');

            // Retail/restaurant toggle (§1: mode is a tenant setting, not a
            // fork). Admin-gated in the controller, same pattern as branding.
            Route::patch('settings/mode', [TenantModeController::class, 'update'])
                ->name('settings.mode');

            // Analytics (Phase 6 · feat/analytics): sales, top products, dead
            // stock, branch performance — read models over the sales ledger.
            Route::get('analytics', [AnalyticsController::class, 'index'])->name('analytics');

            // White-label branding (Phase 8 · feat/billing-whitelabel). Admin-only.
            Route::get('settings/branding', [BrandingController::class, 'edit'])->name('settings.branding');
            Route::patch('settings/branding', [BrandingController::class, 'update'])
                ->name('settings.branding.update');

            // Catalog & inventory (Phase 2 · feat/catalog)
            Route::get('products/import', [ImportProductsController::class, 'create'])->name('products.import');
            Route::post('products/import', [ImportProductsController::class, 'store']);

            // Inventory tools (feat/inventory-tools). Declared BEFORE the
            // products resource so these literal paths aren't captured by
            // products/{product}.
            Route::get('products/template', ImportTemplateController::class)->name('products.template');
            Route::get('products/export', ProductExportController::class)->name('products.export');
            Route::get('products/barcodes', BarcodeSheetController::class)->name('products.barcodes');
            Route::resource('products', ProductController::class)
                ->only(['index', 'create', 'store', 'destroy']);
            Route::resource('categories', CategoryController::class)
                ->only(['index', 'store', 'destroy']);

            // Till provisioning (Phase 3): create a device, reveal its token once.
            Route::resource('devices', DeviceController::class)
                ->only(['index', 'store', 'destroy']);

            // Kitchen display (Phase 5 · feat/restaurant). Restaurant-only; the
            // controller 404s for retail tenants.
            Route::get('kitchen', [KitchenController::class, 'index'])->name('kitchen');
            Route::patch('kitchen/{kitchenOrder}', [KitchenController::class, 'update'])
                ->name('kitchen.update');

            // Operational sales list — who sold what, per cashier (feat/ops-pages).
            Route::get('orders', [OrdersController::class, 'index'])->name('orders');

            // Financial ledger — tender-method breakdown + payment records.
            Route::get('transactions', [TransactionsController::class, 'index'])->name('transactions');

            // Branch management — CRUD, admin-gated in the controller.
            Route::get('branches', [BranchController::class, 'index'])->name('branches.index');
            Route::post('branches', [BranchController::class, 'store'])->name('branches.store');
            Route::patch('branches/{branch}', [BranchController::class, 'update'])->name('branches.update');
            Route::delete('branches/{branch}', [BranchController::class, 'destroy'])->name('branches.destroy');

            // General settings — business name, currency, VAT rate. The rate
            // configured here is what pos/src/lib/tax.ts backs out of prices.
            Route::get('settings/general', [SettingsController::class, 'edit'])->name('settings.general');
            Route::patch('settings/general', [SettingsController::class, 'update'])
                ->name('settings.general.update');

            // Rule-based inventory/pricing insights (see AiInsightsService for
            // why these are labeled rule-based rather than AI-generated).
            Route::get('ai-insights', [AiInsightsController::class, 'index'])->name('ai-insights');

            // Staff management: identity, role, branch, PIN/password. NOT
            // scheduling or payroll — that's a separate, later surface.
            Route::get('staff', [StaffController::class, 'index'])->name('staff.index');
            Route::post('staff', [StaffController::class, 'store'])->name('staff.store');
            Route::patch('staff/{staff}', [StaffController::class, 'update'])->name('staff.update');
            Route::delete('staff/{staff}', [StaffController::class, 'destroy'])->name('staff.destroy');
            Route::post('staff/{staff}/restore', [StaffController::class, 'restore'])->name('staff.restore');
            Route::post('staff/{staff}/reset-pin', [StaffController::class, 'resetPin'])->name('staff.reset-pin');
            Route::post('staff/{staff}/reset-password', [StaffController::class, 'resetPassword'])
                ->name('staff.reset-password');

            // Self-service: change my own password.
            Route::get('settings/account', [AccountController::class, 'edit'])->name('settings.account');
            Route::patch('settings/account/password', [AccountController::class, 'updatePassword'])
                ->name('settings.account.password');

            // Tasks — store-operations checklist. Any dashboard user can view
            // and complete; create/assign/delete is admin-gated (controller).
            // The till reaches Tasks via the separate Pos\TaskController above,
            // not these routes.
            Route::get('tasks', [TaskController::class, 'index'])->name('tasks.index');
            Route::post('tasks', [TaskController::class, 'store'])->name('tasks.store');
            Route::patch('tasks/{task}', [TaskController::class, 'update'])->name('tasks.update');
            Route::post('tasks/{task}/complete', [TaskController::class, 'complete'])->name('tasks.complete');
            Route::post('tasks/{task}/reopen', [TaskController::class, 'reopen'])->name('tasks.reopen');
            Route::delete('tasks/{task}', [TaskController::class, 'destroy'])->name('tasks.destroy');

            // ZIMRA Fiscalisation config (Phase 7). Only verifyDevice makes a
            // real external call — see FiscalisationService for what's real.
            Route::get('settings/fiscalisation', [FiscalisationController::class, 'edit'])
                ->name('settings.fiscalisation');
            Route::patch('settings/fiscalisation/toggle', [FiscalisationController::class, 'toggle'])
                ->name('settings.fiscalisation.toggle');
            Route::post('settings/fiscalisation/device', [FiscalisationController::class, 'saveDevice'])
                ->name('settings.fiscalisation.device');
            Route::post('settings/fiscalisation/verify', [FiscalisationController::class, 'verify'])
                ->name('settings.fiscalisation.verify');

            // Wivae's own subscription billing via Paynow (docs §9.1) — never
            // in-store customer payments. Webhook lives outside this group
            // (unauthenticated, above).
            Route::get('settings/payments', [BillingController::class, 'index'])->name('settings.payments');
            Route::post('settings/payments/subscribe', [BillingController::class, 'subscribe'])
                ->name('settings.payments.subscribe');

            // HR & Payroll (MVP: salary-based — see PayrollService).
            Route::get('payroll', [PayrollController::class, 'index'])->name('payroll.index');
            Route::post('payroll/run', [PayrollController::class, 'run'])->name('payroll.run');
            Route::patch('payroll/staff/{user}/salary', [PayrollController::class, 'setSalary'])
                ->name('payroll.salary');
            Route::patch('payroll/nssa', [PayrollController::class, 'setNssa'])->name('payroll.nssa');
        });
    });

/*
|--------------------------------------------------------------------------
| POS API — device bearer auth, stateless JSON (Phase 3 · feat/pos-offline)
|--------------------------------------------------------------------------
| Authenticated by device token via ResolveDevice, NOT by subdomain/session.
| CSRF-exempt (see bootstrap/app.php). This is what the offline till syncs to.
*/
Route::domain('{tenant}.' . $rootDomain)
    ->middleware(ResolveDevice::class)
    ->group(function () {
        Route::get('pos/session', [PosController::class, 'session']);
        Route::get('sync/bootstrap', [SyncController::class, 'bootstrap']);
        Route::post('sync/push', [SyncController::class, 'push']);
        Route::get('sync/pull', [SyncController::class, 'pull']);

        // Tasks (till side): deliberately online-first, not part of the sync
        // engine above — see Pos\TaskController for why.
        Route::get('pos/tasks', [PosTaskController::class, 'index']);
        Route::post('pos/tasks/{task}/complete', [PosTaskController::class, 'complete']);
    });

/*
|--------------------------------------------------------------------------
| POS PWA shell (Phase 3 · feat/pos-offline)
|--------------------------------------------------------------------------
| Serves the built offline-first till at {tenant}.wivae.test/pos. Registered
| AFTER the POS API group so pos/session and sync/* match their handlers first;
| this catch-all only picks up /pos and /pos/* navigations. Hashed assets under
| /pos/assets/* are served as static files before routing ever runs.
*/
Route::domain('{tenant}.' . $rootDomain)
    ->get('/pos/{any?}', PosShellController::class)
    ->where('any', '.*')
    ->name('pos.shell');
