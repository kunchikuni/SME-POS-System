<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\RegisteredTenantController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ImportProductsController;
use App\Http\Controllers\ProductController;
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

            // Catalog & inventory (Phase 2 · feat/catalog)
            Route::get('products/import', [ImportProductsController::class, 'create'])->name('products.import');
            Route::post('products/import', [ImportProductsController::class, 'store']);
            Route::resource('products', ProductController::class)
                ->only(['index', 'create', 'store', 'destroy']);
            Route::resource('categories', CategoryController::class)
                ->only(['index', 'store', 'destroy']);
        });
    });
