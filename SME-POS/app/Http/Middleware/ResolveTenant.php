<?php

namespace App\Http\Middleware;

use App\Domain\Tenancy\TenantContext;
use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the tenant from the request subdomain and binds it into the
 * request-scoped TenantContext.
 *
 *   acme.wivae.com  -> tenant with subdomain "acme"
 *
 * Applied to tenant routes only. Central routes (marketing, onboarding on the
 * bare domain) do not run this and have no tenant in context.
 */
class ResolveTenant
{
    public function __construct(private TenantContext $context) {}

    public function handle(Request $request, Closure $next): Response
    {
        $rootDomain = config('brand.tenant_domain');
        $host = $request->getHost();

        // Strip the root domain to isolate the subdomain label.
        $subdomain = str($host)->before('.' . $rootDomain)->toString();

        abort_if(
            $subdomain === '' || $subdomain === $host,
            404,
            'No tenant for this host.'
        );

        $tenant = Tenant::query()
            ->withoutGlobalScopes()
            ->where('subdomain', $subdomain)
            ->where('status', '!=', 'suspended')
            ->first();

        abort_if($tenant === null, 404, 'Unknown tenant.');

        $this->context->set($tenant);

        // Remove the tenant parameter from the route so it doesn't get injected
        // positionally as the first argument to every controller method.
        $request->route()->forgetParameter('tenant');

        // The {tenant} domain segment is a route parameter. Without a default,
        // route('login') / route('dashboard') throw "Missing parameter: tenant".
        // Setting it here lets every named route on the subdomain resolve
        // without passing the tenant explicitly everywhere.
        URL::defaults(['tenant' => $subdomain]);

        // Make the resolved tenant available to Inertia shared props / views.
        $request->attributes->set('tenant', $tenant);

        return $next($request);
    }
}
