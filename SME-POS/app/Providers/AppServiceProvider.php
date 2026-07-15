<?php

namespace App\Providers;

use App\Domain\Tenancy\TenantContext;
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
        // Capability gate used by policies and the UI; reads the staff role.
        Gate::define('administer', fn ($user) => $user->role->canAdminister());
    }
}
