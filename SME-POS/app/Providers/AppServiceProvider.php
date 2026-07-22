<?php

namespace App\Providers;

use App\Domain\Pos\DeviceContext;
use App\Domain\Tenancy\TenantContext;
use App\Domain\Tenancy\TenantUserProvider;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Tell Fortify to ignore its built-in routes — tenancy uses custom
        // controllers (RegisteredTenantController, AuthenticatedSessionController)
        // on bare host and subdomain routes (routes/web.php).
        if (class_exists(\Laravel\Fortify\Fortify::class)) {
            \Laravel\Fortify\Fortify::ignoreRoutes();
        }

        // One tenant per request. `scoped` resets it between requests, which
        // matters for queue workers that process many tenants' jobs in a row.
        $this->app->scoped(TenantContext::class);

        // Same lifetime for the POS device: ResolveDevice sets it, the sync
        // controller reads it — they must share one per-request instance, or
        // the controller sees a null device.
        $this->app->scoped(DeviceContext::class);
    }

    public function boot(): void
    {
        // Auth lookups must bypass the tenant global scope (see
        // TenantUserProvider) or session re-hydration loops. Registered as the
        // 'tenant' provider; config/auth.php points the users provider at it.
        Auth::provider('tenant', fn ($app, array $config) => new TenantUserProvider(
            $app['hash'],
            $config['model'],
        ));

        // Capability gate used by policies and the UI; reads the staff role.
        Gate::define('administer', fn ($user) => $user->role->canAdminister());
    }
}
