<?php

use App\Http\Controllers\Auth\RegisteredTenantController;
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

        Route::middleware('auth')->group(function () {
            Route::get('/dashboard', fn () => Inertia::render('Dashboard/Index'))
                ->name('dashboard');

            // Phase 2+ (feat/catalog): products, categories, branches, staff…
            // Route::resource('products', ProductController::class);
        });
    });
