import { useEffect, useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";

const STATUS_TINT: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  trialing: "bg-blue-50 text-blue-700",
  past_due: "bg-amber-50 text-amber-700",
  canceled: "bg-canvas text-muted",
};

const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

// Display-only: hardware isn't charged through this page (see below).
const HARDWARE: Record<string, { label: string; price: number }> = {
  bundle: { label: "Starter bundle (tablet + receipt printer)", price: 120 },
  printer: { label: "Thermal receipt printer only", price: 40 },
};

/**
 * Wivae's own subscription billing, via Paynow — not in-store customer
 * payments (those are labels recorded on sales, never processed by Wivae).
 *
 * The plans come from the server (GET /billing/payments), the same list it
 * prices payments from. This page used to hardcode its own BYOD/"Growth"/
 * "Scale" plans at other prices, post to a page URL instead of the API, and
 * offer a ZIMRA add-on the server doesn't sell — so paying never worked.
 */
export default function PaymentsSettings() {
  usePageTitle("Payments");
  const { flash, showFlash } = useFlash();
  const { data, loading } = useQuery(() => api.billing.get(), []);

  const subscription = (data?.subscription as any) ?? null;
  const trialEndsAt = data?.trialEndsAt ?? null;
  const plans = data?.plans ?? [];

  const [selectedPlan, setSelectedPlan] = useState<string>("byod");
  useEffect(() => {
    if (subscription?.plan) setSelectedPlan(subscription.plan);
  }, [subscription?.plan]);

  // Back from Paynow (returnUrl = /settings/payments?paynow=return).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paynow") === "return") {
      showFlash("Payment received by Paynow. Your plan activates as soon as Paynow confirms it — usually within a minute.");
    }
  }, [showFlash]);

  const currentPlan = plans.find((p) => p.key === selectedPlan) ?? plans[0];

  const { submit: subscribe, loading: subscribing } = useMutation(
    (plan: string) => api.billing.subscribe(plan),
    {
      onSuccess: (r) => { if (r?.redirectUrl) window.location.href = r.redirectUrl; },
      onError: (err) => showFlash(err.message, "error"),
    },
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="mt-8 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {flash.message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${flash.type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>
          {flash.message}
        </div>
      )}

      <h1 className="text-xl font-semibold tracking-tight text-ink">Payments</h1>
      <p className="mt-1 text-sm text-muted">Your Wivae subscription — not your customers' payments.</p>

      <div className="mt-6 max-w-3xl space-y-6">
        {trialEndsAt && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            You're on a free trial until {new Date(trialEndsAt).toLocaleDateString()}. Choose a plan any
            time to keep going after it ends.
          </div>
        )}

        {subscription && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-5">
            <div>
              <h2 className="font-semibold text-ink">Current plan</h2>
              <p className="mt-1 text-sm text-muted">
                {plans.find((p) => p.key === subscription.plan)?.label ?? subscription.plan}
                {subscription.currentPeriodEnd &&
                  ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_TINT[subscription.status] ?? "bg-canvas text-muted"}`}>
              {String(subscription.status).replace("_", " ")}
            </span>
          </div>
        )}

        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="font-semibold text-ink">Choose a plan</h2>
          <p className="mt-1 text-xs text-muted">BYOD is billed monthly. Standard and Premium are a one-time payment and include hardware.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <button
                key={p.key}
                onClick={() => setSelectedPlan(p.key)}
                className={`rounded-lg border p-3 text-left ${
                  selectedPlan === p.key ? "border-brand-600 bg-brand-50" : "border-hairline hover:bg-canvas"
                }`}
              >
                <div className="font-medium text-ink">{p.label}</div>
                <div className="text-sm text-muted">
                  {money(p.amountCents)}{p.recurring ? "/mo" : " one-time"}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {p.branches === null ? "Unlimited branches" : `Up to ${p.branches} branch${p.branches === 1 ? "" : "es"}`}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {p.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          {currentPlan && (
            <>
              <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
                <span className="text-sm text-muted">Total due now</span>
                <span className="text-xl font-semibold text-ink">
                  {money(currentPlan.amountCents)}{currentPlan.recurring ? " for the first month" : ""}
                </span>
              </div>

              <button
                onClick={() => subscribe(currentPlan.key)}
                disabled={subscribing}
                className="mt-4 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {subscribing ? "Redirecting to Paynow…" : `Pay ${money(currentPlan.amountCents)} with Paynow`}
              </button>
              <p className="mt-2 text-center text-xs text-muted">
                {currentPlan.recurring
                  ? "One payment per month — not an automatic recurring charge."
                  : "A single one-time payment."}
              </p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="font-semibold text-ink">Hardware</h2>
          <p className="mt-1 text-xs text-muted">
            Optional, one-time — for BYOD, or extra devices on any plan.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(HARDWARE).map(([key, h]) => (
              <div key={key} className="rounded-lg border border-hairline p-3">
                <div className="font-medium text-ink">{h.label}</div>
                <div className="text-sm text-muted">${h.price} one-time · 6 months warranty</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Ordering hardware directly from this page is coming soon — for now, contact support to arrange one.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
