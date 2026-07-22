<?php

namespace App\Http\Controllers;

use App\Domain\Billing\PaynowService;
use App\Domain\Tenancy\TenantContext;
use App\Models\Subscription;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Wivae's own subscription billing (Payments tab). See PaynowService for the
 * webhook-trust design and why recurring billing is deliberately a per-period
 * prompt, not an auto-charge.
 */
class BillingController extends Controller
{
    public function index(TenantContext $tenant, PaynowService $paynow): Response
    {
        $subscription = Subscription::latest()->first();

        return Inertia::render('Payments/Index', [
            'tenant' => [
                'onTrial'  => $tenant->get()->onTrial(),
                'trialEnd' => $tenant->get()->trial_ends_at?->toIso8601String(),
            ],
            'subscription' => $subscription ? [
                'plan'               => $subscription->plan,
                'status'             => $subscription->status,
                'zimra_addon'        => $subscription->zimra_addon,
                'current_period_end' => $subscription->current_period_end?->toIso8601String(),
            ] : null,
            'plans' => config('paynow.plans'),
            'zimraAddonPrice' => config('paynow.zimra_addon_price'),
            'paynowAvailable' => $paynow->isAvailable(),
        ]);
    }

    public function subscribe(Request $request, PaynowService $paynow, TenantContext $tenant): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate([
            'plan'        => ['required', Rule::in(array_keys(config('paynow.plans')))],
            'zimra_addon' => ['boolean'],
        ]);

        $subscription = Subscription::updateOrCreate(
            [], // one subscription row per tenant, for now
            ['plan' => $data['plan'], 'zimra_addon' => $data['zimra_addon'] ?? false],
        );

        $result = $paynow->createPeriodPayment(
            $tenant->get(),
            $subscription,
            route('billing.webhook'),
            route('settings.payments') . '?paynow=return',
        );

        if (! $result['ok']) {
            return back()->with('flash', $result['message']);
        }

        return Inertia::location($result['redirect_url']);
    }

    /**
     * Paynow's result-URL callback. Its body is deliberately NOT trusted or
     * parsed — see PaynowService docblock. It's just a trigger to re-check
     * status directly with Paynow.
     */
    public function webhook(PaynowService $paynow): string
    {
        $subscription = Subscription::whereNotNull('poll_url')->latest()->first();
        if ($subscription) {
            $paynow->checkStatus($subscription);
        }

        return 'ok'; // Paynow just needs a 200
    }
}
