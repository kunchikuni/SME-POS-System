<?php

namespace App\Http\Middleware;

use App\Domain\Billing\EntitlementService;
use App\Domain\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates a route group behind a plan feature — e.g. `middleware('feature:payroll')`
 * on the Payroll routes. Applied at the route level rather than repeated as
 * abort_unless() calls in every controller method: one line per feature,
 * impossible to forget on a new action added to an already-gated controller
 * later. See EntitlementService::hasFeature() for the actual matching logic.
 *
 * A blocked request gets a real 403 page with an explanation, not a bare
 * abort — this is a plan limitation the tenant can act on (upgrade), not a
 * generic permissions error.
 */
class RequireFeature
{
    public function __construct(
        private TenantContext $tenantContext,
        private EntitlementService $entitlements,
    ) {
    }

    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $tenant = $this->tenantContext->get();

        abort_if($tenant === null, 404);

        abort_unless(
            $this->entitlements->hasFeature($tenant, $feature),
            403,
            'This feature isn\'t included on your current plan. Visit Settings > Payments to upgrade.',
        );

        return $next($request);
    }
}
