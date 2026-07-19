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

        // The {tenant} domain segment is a route parameter. Without a default,
        // route('login') / route('dashboard') throw "Missing parameter: tenant".
        // Setting it here lets every named route on the subdomain resolve
        // without passing the tenant explicitly everywhere.
        URL::defaults(['tenant' => $subdomain]);

        // Make the resolved tenant available to Inertia shared props / views.
        $request->attributes->set('tenant', $tenant);

        // {tenant} is a domain wildcard, not a URI parameter — but it still
        // lives in the matched route's parameter bag alongside real URI
        // parameters like {staff}/{branch}. Left there, it can leak into a
        // scalar-typed controller argument on routes with only one other
        // parameter (e.g. `update(Request $request, string $staff)` receiving
        // "demo" — the tenant subdomain — instead of the UUID from {staff}).
        // Nothing after this point needs it: the tenant is already resolved
        // above from the raw host string, and URL::defaults() was set from
        // that same string, not from this route parameter.
        $request->route()?->forgetParameter('tenant');

        return $next($request);
    }
}
