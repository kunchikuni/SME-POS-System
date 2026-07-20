<?php

namespace App\Domain\Billing;

use App\Models\Subscription;
use App\Models\Tenant;
use Paynow\Payments\Paynow;

/**
 * Wivae's own subscription billing via Paynow — never in-store customer
 * payments (docs §9.1, §1). Built on the OFFICIAL `paynow/php-sdk` Composer
 * package (confirmed current from developers.paynow.co.zw's PHP quickstart,
 * fetched directly, not from memory), not hand-rolled HTTP calls — Paynow's
 * webhook hash-verification algorithm isn't documented in the quickstart, and
 * this deliberately avoids needing to know it.
 *
 * DESIGN: the incoming webhook (BillingController::webhook) is treated as a
 * mere "something changed, go check" trigger — its body is NOT trusted or
 * parsed for authoritative data. checkStatus() below re-fetches status
 * directly from Paynow's own server via the SDK's documented
 * pollTransaction(), which is inherently trustworthy (HTTPS to Paynow
 * directly) without needing to verify a hash on data we didn't originate.
 *
 * RECURRING BILLING: Paynow's own support channel and docs disagree on
 * whether tokenized/automatic recurring charging is actually available
 * (confirmed via a live Nov-2025 forum thread, not assumed) — so this always
 * creates a fresh payment prompt per period, never a stored card auto-charge.
 * That's the "per-period payment prompt" fallback the architecture doc
 * already named as the safe default (§9.1).
 *
 * REQUIRES: `composer require paynow/php-sdk`, and PAYNOW_INTEGRATION_ID /
 * PAYNOW_INTEGRATION_KEY in .env (from the Paynow merchant dashboard).
 */
class PaynowService
{
    private function client(string $resultUrl, string $returnUrl): Paynow
    {
        return new Paynow(
            config('paynow.integration_id'),
            config('paynow.integration_key'),
            $returnUrl,
            $resultUrl,
        );
    }

    /**
     * Starts a payment for one billing period. Returns the redirect URL to
     * send the owner to, and updates the subscription with the reference and
     * poll URL needed to later confirm payment via checkStatus().
     */
    public function createPeriodPayment(
        Tenant $tenant,
        Subscription $subscription,
        string $resultUrl,
        string $returnUrl,
    ): array {
        $plan = config("paynow.plans.{$subscription->plan}");
        if ($plan === null) {
            return ['ok' => false, 'message' => 'Unknown plan.'];
        }

        $amount = $plan['price'] + ($subscription->zimra_addon ? config('paynow.zimra_addon_price') : 0);
        $reference = "wivae-{$tenant->subdomain}-{$subscription->id}-" . now()->format('Ym');

        $ownerEmail = \App\Models\User::where('role', 'owner')->value('email');

        $paynow = $this->client($resultUrl, $returnUrl);
        $payment = $paynow->createPayment($reference, $ownerEmail ?? "{$tenant->subdomain}@billing.wivae.app");
        $payment->add($plan['label'] . ' plan' . ($subscription->zimra_addon ? ' + ZIMRA add-on' : ''), $amount);

        $response = $paynow->send($payment);

        if (! $response->success()) {
            return ['ok' => false, 'message' => 'Paynow could not start this payment. Please try again.'];
        }

        $subscription->update([
            'provider_ref' => $reference,
            'poll_url'     => $response->pollUrl(),
            'status'       => 'past_due', // stays past_due until checkStatus() confirms payment
        ]);

        return ['ok' => true, 'redirect_url' => $response->redirectUrl()];
    }

    /**
     * The authoritative check: asks Paynow's own server whether the
     * subscription's current payment has actually been paid, and only trusts
     * that answer — never the webhook body that triggered this call.
     */
    public function checkStatus(Subscription $subscription): bool
    {
        if ($subscription->poll_url === null) {
            return false;
        }

        // A throwaway client: pollTransaction only needs valid integration
        // credentials, not the result/return URLs used to create the payment.
        $paynow = $this->client('', '');
        $status = $paynow->pollTransaction($subscription->poll_url);

        if ($status->paid()) {
            $subscription->update([
                'status'             => 'active',
                'current_period_end' => now()->addMonth(),
            ]);
            return true;
        }

        return false;
    }
}
