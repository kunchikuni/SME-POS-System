import { Head, useForm } from "@inertiajs/react";
import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface PlanInfo {
  label: string;
  price: number;
  recurring: boolean;
}
interface Subscription {
  plan: string;
  status: string;
  zimra_addon: boolean;
  current_period_end: string | null;
}
interface Props {
  tenant: { onTrial: boolean; trialEnd: string | null };
  subscription: Subscription | null;
  plans: Record<string, PlanInfo>;
  zimraAddonPrice: number;
  [key: string]: unknown;
}

const STATUS_TINT: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  trialing: "bg-blue-50 text-blue-700",
  past_due: "bg-amber-50 text-amber-700",
  canceled: "bg-slate-100 text-slate-500",
};

/**
 * Wivae's own subscription billing, via Paynow — not in-store customer
 * payments (those are labels recorded on sales, never processed by Wivae).
 * Each period is a fresh payment prompt, not an automatic recurring charge —
 * Paynow's own support channel doesn't reliably confirm tokenized auto-billing
 * is available, so this doesn't pretend it does.
 */
export default function PaymentsSettings({ tenant, subscription, plans, zimraAddonPrice }: Props) {
  const [selectedPlan, setSelectedPlan] = useState(subscription?.plan ?? "byod");
  const [zimraAddon, setZimraAddon] = useState(subscription?.zimra_addon ?? false);
  const form = useForm({ plan: selectedPlan, zimra_addon: zimraAddon });

  function subscribe() {
    form.setData({ plan: selectedPlan, zimra_addon: zimraAddon });
    form.post("/settings/payments/subscribe", { preserveScroll: true });
  }

  const total = (plans[selectedPlan]?.price ?? 0) + (zimraAddon ? zimraAddonPrice : 0);

  return (
    <AppLayout>
      <Head title="Payments" />
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Payments</h1>
      <p className="mt-1 text-sm text-slate-500">Your Wivae subscription — not your customers' payments.</p>

      <div className="mt-6 max-w-xl space-y-6">
        {tenant.onTrial && tenant.trialEnd && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            You're on a free trial until {new Date(tenant.trialEnd).toLocaleDateString()}. Choose a plan any
            time to keep going after it ends.
          </div>
        )}

        {subscription && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="font-semibold text-slate-900">Current plan</h2>
              <p className="mt-1 text-sm text-slate-500">
                {plans[subscription.plan]?.label ?? subscription.plan}
                {subscription.zimra_addon && " + ZIMRA add-on"}
                {subscription.current_period_end &&
                  ` · renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_TINT[subscription.status] ?? "bg-slate-100 text-slate-500"}`}>
              {subscription.status.replace("_", " ")}
            </span>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Choose a plan</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Object.entries(plans).map(([key, plan]) => (
              <button
                key={key}
                onClick={() => setSelectedPlan(key)}
                className={`rounded-lg border p-3 text-left ${
                  selectedPlan === key ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="font-medium text-slate-900">{plan.label}</div>
                <div className="text-sm text-slate-500">
                  ${plan.price}
                  {plan.recurring ? "/mo" : " once-off"}
                </div>
              </button>
            ))}
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={zimraAddon} onChange={(e) => setZimraAddon(e.target.checked)} />
            Add ZIMRA Fiscalisation (+${zimraAddonPrice}/mo)
          </label>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-500">Total due now</span>
            <span className="text-xl font-semibold text-slate-900">${total}</span>
          </div>

          <button
            onClick={subscribe}
            disabled={form.processing}
            className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {form.processing ? "Redirecting to Paynow…" : "Pay with Paynow"}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">
            Billed as one payment per period — not an automatic recurring charge.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
