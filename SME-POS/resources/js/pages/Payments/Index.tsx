import { Head, useForm } from "@inertiajs/react";
import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface PlanInfo {
    label: string;
    price: number;
    recurring: boolean;
    branches: number | null;
    features: string[];
}
interface HardwareInfo {
    label: string;
    price: number;
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
    hardware: Record<string, HardwareInfo>;
    paynowAvailable: boolean;
    [key: string]: unknown;
}

const STATUS_TINT: Record<string, string> = {
    active: "bg-green-50 text-green-700",
    trialing: "bg-blue-50 text-blue-700",
    past_due: "bg-amber-50 text-amber-700",
    canceled: "bg-canvas text-muted",
};

/**
 * Wivae's own subscription billing, via Paynow — not in-store customer
 * payments (those are labels recorded on sales, never processed by Wivae).
 * Each period is a fresh payment prompt, not an automatic recurring charge —
 * Paynow's own support channel doesn't reliably confirm tokenized auto-billing
 * is available, so this doesn't pretend it does.
 *
 * Software and hardware are deliberately separate here, not one bundled
 * price — see config/paynow.php for why a bundled one-time price didn't
 * survive contact with real hardware cost research. Hardware is shown for
 * transparency but isn't purchasable from this screen yet — that's a real
 * order-tracking/shipping feature of its own, not something to half-build
 * behind a button that doesn't actually do anything yet.
 */
export default function PaymentsSettings({ tenant, subscription, plans, zimraAddonPrice, hardware, paynowAvailable }: Props) {
    const [selectedPlan, setSelectedPlan] = useState(subscription?.plan ?? "byod");
    const [zimraAddon, setZimraAddon] = useState(subscription?.zimra_addon ?? false);
    const form = useForm({ plan: selectedPlan, zimra_addon: zimraAddon });

    const plan = plans[selectedPlan];
    const includesFiscalisation = plan?.features.some((f) => f.toLowerCase().includes("fiscalisation")) ?? false;

    function subscribe() {
        form.setData({ plan: selectedPlan, zimra_addon: includesFiscalisation ? false : zimraAddon });
        form.post("/settings/payments/subscribe", { preserveScroll: true });
    }

    const total = (plan?.price ?? 0) + (!includesFiscalisation && zimraAddon ? zimraAddonPrice : 0);

    return (
        <AppLayout>
            <Head title="Payments" />
            <h1 className="text-xl font-semibold tracking-tight text-ink">Payments</h1>
            <p className="mt-1 text-sm text-muted">Your Wivae subscription — not your customers' payments.</p>

            {!paynowAvailable && (
                <div className="mt-6 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-medium">Payments isn't available right now.</p>
                    <p className="mt-1">Please contact support to enable this for your store.</p>
                </div>
            )}

            <div className="mt-6 max-w-2xl space-y-6">
                {tenant.onTrial && tenant.trialEnd && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                        You're on a free trial until {new Date(tenant.trialEnd).toLocaleDateString()}. Choose a plan any
                        time to keep going after it ends.
                    </div>
                )}

                {subscription && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-5">
                        <div>
                            <h2 className="font-semibold text-ink">Current plan</h2>
                            <p className="mt-1 text-sm text-muted">
                                {plans[subscription.plan]?.label ?? subscription.plan}
                                {subscription.zimra_addon && " + ZIMRA add-on"}
                                {subscription.current_period_end &&
                                    ` · renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}
                            </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_TINT[subscription.status] ?? "bg-canvas text-muted"}`}>
              {subscription.status.replace("_", " ")}
            </span>
                    </div>
                )}

                <div className="rounded-xl border border-hairline bg-surface p-5">
                    <h2 className="font-semibold text-ink">Choose a plan</h2>
                    <p className="mt-1 text-xs text-muted">All plans are billed monthly — no hardware bundled in.</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {Object.entries(plans).map(([key, p]) => (
                            <button
                                key={key}
                                onClick={() => setSelectedPlan(key)}
                                className={`rounded-lg border p-3 text-left ${
                                    selectedPlan === key ? "border-brand-600 bg-brand-50" : "border-hairline hover:bg-canvas"
                                }`}
                            >
                                <div className="font-medium text-ink">{p.label}</div>
                                <div className="text-sm text-muted">
                                    ${p.price}
                                    {p.recurring ? "/mo" : " once-off"}
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

                    {includesFiscalisation ? (
                        <p className="mt-4 text-sm text-muted">ZIMRA Fiscalisation is included in {plan.label}.</p>
                    ) : (
                        <label className="mt-4 flex items-center gap-2 text-sm text-ink">
                            <input type="checkbox" checked={zimraAddon} onChange={(e) => setZimraAddon(e.target.checked)} />
                            Add ZIMRA Fiscalisation (+${zimraAddonPrice}/mo)
                        </label>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
                        <span className="text-sm text-muted">Total due now</span>
                        <span className="text-xl font-semibold text-ink">${total}/mo</span>
                    </div>

                    <button
                        onClick={subscribe}
                        disabled={form.processing || !paynowAvailable}
                        className="mt-4 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                        {!paynowAvailable ? "Payments not configured" : form.processing ? "Redirecting to Paynow…" : "Pay with Paynow"}
                    </button>
                    <p className="mt-2 text-center text-xs text-muted">
                        Billed as one payment per period — not an automatic recurring charge.
                    </p>
                </div>

                <div className="rounded-xl border border-hairline bg-surface p-5">
                    <h2 className="font-semibold text-ink">Hardware</h2>
                    <p className="mt-1 text-xs text-muted">
                        Optional, one-time — works with any plan above, including BYOD if you'd rather buy through us than
                        bring your own device.
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {Object.entries(hardware).map(([key, h]) => (
                            <div key={key} className="rounded-lg border border-hairline p-3">
                                <div className="font-medium text-ink">{h.label}</div>
                                <div className="text-sm text-muted">${h.price} once-off</div>
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
