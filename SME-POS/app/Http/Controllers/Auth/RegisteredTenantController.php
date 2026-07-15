<?php

namespace App\Http\Controllers\Auth;

use App\Domain\Tenancy\RegisterTenant;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterTenantRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Tenant signup lives on the central (bare) domain. On success we redirect
 * to the new tenant's subdomain, where the session and dashboard live.
 */
class RegisteredTenantController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('Auth/Register', [
            'trialDays'    => config('brand.trial_days'),
            'tenantDomain' => config('brand.tenant_domain'),
        ]);
    }

    public function store(RegisterTenantRequest $request, RegisterTenant $register): RedirectResponse
    {
        $result = $register->handle(
            businessName: $request->string('business_name'),
            subdomain:    $request->string('subdomain'),
            ownerName:    $request->string('owner_name'),
            ownerEmail:   $request->string('owner_email'),
            password:     $request->string('password'),
        );

        $scheme = $request->getScheme();
        $host   = $result['tenant']->subdomain . '.' . config('brand.tenant_domain');

        // The owner authenticates on their own subdomain (session cookie is
        // scoped there), so we hand off rather than logging in on the bare host.
        return redirect()->away("{$scheme}://{$host}/login?welcome=1");
    }
}
