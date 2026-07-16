<?php

namespace App\Providers;

use App\Domain\Tenancy\TenantContext;
use App\Domain\Tenancy\TenantUserProvider;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // One tenant per request. `scoped` resets it between requests, which
        // matters for queue workers that process many tenants' jobs in a row.
        $this->app->scoped(TenantContext::class);
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
