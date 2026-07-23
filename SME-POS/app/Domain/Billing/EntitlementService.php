<?php

namespace App\Domain\Billing;

use App\Models\Branch;
use App\Models\Subscription;
use App\Models\Tenant;

/**
 * The single place that answers "is this tenant allowed to do X" against
 * their trial/subscription status and plan — the gate that didn't exist
 * before this. config('paynow.plans') was, until now, purely billing and
 * marketing display metadata: a BYOD tenant could use Payroll, add
 * unlimited branches, or use Fiscalisation for free, because nothing
 * technical checked any of it. This is what actually enforces it.
 *
 * Trial tenants get full (Premium-equivalent) access while evaluating —
 * common SaaS pattern, and simpler than trying to guess which plan a
 * not-yet-paying tenant "should" be limited to. Once the trial ends,
 * hasAccess() requires a real active subscription, and everything else
 * gates on that subscription's actual plan.
 */
class EntitlementService
{
    /**
     * The broad gate: can this tenant use the product AT ALL right now?
     * False means trial has ended and there's no active subscription — see
     * EnsureSubscribed middleware, which is what actually acts on this.
     */
    public function hasAccess(Tenant $tenant): bool
    {
        if ($tenant->onTrial()) {
            return true;
        }

        return $this->activeSubscription($tenant) !== null;
    }

    /**
     * The plan to evaluate feature/limit checks against. Trial tenants (no
     * subscription yet, or one that hasn't started billing) are treated as
     * Premium — full access to evaluate the product, not artificially
     * restricted before they've even chosen a plan.
     */
    public function planKey(Tenant $tenant): string
    {
        $subscription = $this->activeSubscription($tenant);

        if ($subscription === null) {
            return 'premium';
        }

        return $subscription->plan;
    }

    /**
     * Whether the tenant's current plan includes a named feature.
     *
     * Matched by case-insensitive substring against config('paynow.plans')'s
     * feature lists (e.g. 'payroll' matches "Payroll & HR") — those strings
     * are also what's shown on the pricing page, so keeping this as a
     * substring match against the SAME array means the enforcement can
     * never silently drift from what's advertised, the way a hand-maintained
     * parallel feature list could.
     *
     * 'fiscalisation' is a special case: Premium includes it in the
     * features list already, but BYOD/Standard can also have it via the
     * standalone $20/mo add-on (Subscription::zimra_addon), which isn't
     * expressible as a plan feature string — so that path is checked
     * separately here rather than forcing an awkward "Fiscalisation
     * (add-on)" string match.
     */
    public function hasFeature(Tenant $tenant, string $feature): bool
    {
        if (strtolower($feature) === 'fiscalisation') {
            $subscription = $this->activeSubscription($tenant);

            return $tenant->onTrial()
                || $this->planKey($tenant) === 'premium'
                || ($subscription?->zimra_addon ?? false);
        }

        $plan = config('paynow.plans.' . $this->planKey($tenant));
        $features = $plan['features'] ?? [];

        foreach ($features as $line) {
            if (str_contains(strtolower($line), strtolower($feature))) {
                return true;
            }
        }

        return false;
    }

    /** Null means unlimited (Premium, or a trial tenant evaluating). */
    public function branchLimit(Tenant $tenant): ?int
    {
        if ($tenant->onTrial()) {
            return null;
        }

        return config('paynow.plans.' . $this->planKey($tenant) . '.branches');
    }

    public function canAddBranch(Tenant $tenant): bool
    {
        $limit = $this->branchLimit($tenant);

        if ($limit === null) {
            return true;
        }

        $currentCount = Branch::where('tenant_id', $tenant->id)->count();

        return $currentCount < $limit;
    }

    /**
     * A subscription counts as "active" for entitlement purposes if its
     * status is active AND it hasn't lapsed past its paid period — status
     * alone isn't enough, since a webhook delay could leave a stale
     * 'active' row sitting past current_period_end.
     */
    private function activeSubscription(Tenant $tenant): ?Subscription
    {
        return Subscription::where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->where(function ($q) {
                $q->whereNull('current_period_end')
                  ->orWhere('current_period_end', '>=', now());
            })
            ->first();
    }
}
