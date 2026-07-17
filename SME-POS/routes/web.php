<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\RegisteredTenantController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\ImportProductsController;
use App\Http\Controllers\KitchenController;
use App\Http\Controllers\Pos\PosController;
use App\Http\Controllers\Pos\SyncController;
use App\Http\Controllers\PosShellController;
use App\Http\Controllers\ProductController;
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

/*
|--------------------------------------------------------------------------
| Tenant routes — any subdomain ({tenant}.wivae.test)
|--------------------------------------------------------------------------
| ResolveTenant binds the tenant from the subdomain. Fortify provides the
| login/logout routes; everything past `auth` is a signed-in staff member.
*/
Route::domain('{tenant}.' . $rootDomain)
    ->middleware(ResolveTenant::class)
    ->group(function () {

        // Tenant root: the natural URL to type. Guests bounce to /login via
        // the auth middleware; signed-in staff land on their dashboard.
        Route::get('/', fn () => redirect('/dashboard'));

        // Guests: the tenant login screen (ResolveTenant has set context, so
        // authentication is scoped to this subdomain's tenant).
        Route::middleware('guest')->group(function () {
            Route::get('/login', [AuthenticatedSessionController::class, 'create'])->name('login');
            Route::post('/login', [AuthenticatedSessionController::class, 'store']);
        });

        Route::middleware('auth')->group(function () {
            Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');

            Route::get('/dashboard', fn () => Inertia::render('Dashboard/Index'))
                ->name('dashboard');

            // Analytics (Phase 6 · feat/analytics): sales, top products, dead
            // stock, branch performance — read models over the sales ledger.
            Route::get('analytics', [AnalyticsController::class, 'index'])->name('analytics');

            // Catalog & inventory (Phase 2 · feat/catalog)
            Route::get('products/import', [ImportProductsController::class, 'create'])->name('products.import');
            Route::post('products/import', [ImportProductsController::class, 'store']);
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
