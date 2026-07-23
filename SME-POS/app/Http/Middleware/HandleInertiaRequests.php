<?php

namespace App\Http\Middleware;

use App\Domain\Tenancy\TenantContext;
use App\Models\Task;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    /**
     * Props available to every page on both clients. The tenant block is null
     * on central (onboarding) routes and populated on tenant subdomains.
     */
    public function share(Request $request): array
    {
        $tenant = app(TenantContext::class)->get();

        return array_merge(parent::share($request), [
            'brand' => [
                'name'         => config('brand.name'),
                'tagline'      => config('brand.tagline'),
                'tenantDomain' => config('brand.tenant_domain'),
            ],
            'tenant' => $tenant ? [
                'name'          => $tenant->name,
                'mode'          => $tenant->mode,
                'onTrial'       => $tenant->onTrial(),
                'trialEnd'      => $tenant->trial_ends_at?->toIso8601String(),
                'theme'         => $tenant->theme(),
                'openTaskCount' => fn (): int => Task::where('status', 'open')->count(),
            ] : null,
            'auth' => [
                'user' => optional($request->user(), fn ($u) => [
                    'name' => $u->name,
                    'role' => $u->role->value,
                ]),
            ],
            'flash' => [
                'message'         => fn () => $request->session()->get('flash'),
                'deviceToken'     => fn () => $request->session()->get('deviceToken'),
                'staffCredential' => fn () => $request->session()->get('staffCredential'),
            ],
        ]);
    }
}
