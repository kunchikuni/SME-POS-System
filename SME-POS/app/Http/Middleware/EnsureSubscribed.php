<?php

namespace App\Http\Middleware;

use App\Domain\Billing\EntitlementService;
use App\Domain\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The broad gate: trial ended and no active subscription -> redirected to
 * billing, not left free to keep using the product indefinitely. Runs after
 * ResolveTenant (needs tenant context) and auth (only signed-in staff can
 * even reach these routes to begin with).
 *
 * Deliberately a redirect to Settings > Payments with an explanatory flash,
 * not a 403 — this is a billing lapse, not a permissions violation, and the
 * right response is "please renew," not "access denied." The payments route
 * itself (and logout) are excluded below, or a blocked tenant could never
 * reach the one place that lets them fix it.
 */
class EnsureSubscribed
{
    public function __construct(
        private TenantContext $tenantContext,
        private EntitlementService $entitlements,
    ) {
    }

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->routeIs('settings.payments') || $request->routeIs('settings.payments.subscribe') || $request->routeIs('logout')) {
            return $next($request);
        }

        $tenant = $this->tenantContext->get();

        if ($tenant === null) {
            return $next($request);
        }

        if (! $this->entitlements->hasAccess($tenant)) {
            return redirect()
                ->route('settings.payments')
                ->with('flash', 'Your trial has ended. Choose a plan to keep using Wivae.');
        }

        return $next($request);
    }
}
