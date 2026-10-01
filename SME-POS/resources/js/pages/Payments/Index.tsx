import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../Layouts/AppLayout.js";
import { NOTICE_TONE } from "../../Components/PaymentBanner.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { coveredUntil, money, paymentNotice, shortDay } from "../../lib/billing.js";

type BillingData = Awaited<ReturnType<typeof api.billing.get>>;

// Display-only: hardware isn't charged through this page (see below).
const HARDWARE: Record<string, { label: string; price: number }> = {
  bundle: { label: "Starter bundle (tablet + receipt printer)", price: 120 },
  printer: { label: "Thermal receipt printer only", price: 40 },
};

/** Identifies the paid period on record: changes when a payment lands (a new paid row, or a later end date). */
const paidKey = (d: BillingData | null) => {
  const s = d?.subscription as { id?: string; currentPeriodEnd?: string | null } | null | undefined;
  return s ? `${s.id}|${s.currentPeriodEnd ?? ""}` : null;
};

type PrepayOption = { months: number; billedMonths: number };
const FALLBACK_PREPAY: PrepayOption[] = [
  { months: 1, billedMonths: 1 }, { months: 3, billedMonths: 3 }, { months: 6, billedMonths: 5 }, { months: 12, billedMonths: 10 },
];

/** What paying `months` months costs, given one month's price (the server prices it; this only shows it). */
const costFor = (unitCents: number, months: number, options: PrepayOption[]) =>
  unitCents * (options.find((o) => o.months === months)?.billedMonths ?? months);

/**
 * "Pay for: 1 · 3 · 6 · 12 months" — paying ahead is the nearest thing to an
 * automatic charge (nothing to remember for a while), and earns free months:
 * the cheaper for the owner, and fewer Paynow fees for us.
 */
function MonthsPicker({ options, value, onChange }: { options: PrepayOption[]; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-muted">Pay for</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Months to pay for">
        {options.map((o) => {
          const free = o.months - o.billedMonths;
          return (
            <button
              key={o.months}
              type="button"
              aria-pressed={value === o.months}
              onClick={() => onChange(o.months)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium ${
                value === o.months ? "border-brand-600 bg-brand-50 text-brand-700" : "border-hairline text-ink hover:bg-canvas"
              }`}
            >
              {o.months} {o.months === 1 ? "month" : "months"}
              {free > 0 && (
                <span className="mt-0.5 block text-[11px] font-semibold text-positive">{free} free</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Wivae's own subscription billing, via Paynow — not in-store customer
 * payments (those are labels recorded on sales, never processed by Wivae).
 *
 * The plans come from the server (GET /billing/payments), the same list it
 * prices payments from. This page used to hardcode its own BYOD/"Growth"/
 * "Scale" plans at other prices, post to a page URL instead of the API, and
 * offer a ZIMRA add-on the server doesn't sell — so paying never worked.
 *
 * This is also where a business whose trial or paid month has ended lands (the
 * rest of the dashboard is shut until it pays), so it says why and what to pay.
 */
export default function PaymentsSettings() {
  usePageTitle("Payments");
  const { flash, showFlash } = useFlash();
  const { user, refetch: refetchAuth } = useAuth();
  const { data, loading } = useQuery(() => api.billing.get(), []);

  // Back from Paynow (returnUrl = /settings/payments?paynow=return) the
  // confirmation arrives separately, by webhook, usually within a minute — so
  // check again every few seconds until the payment shows up. (Not through
  // useQuery: its refetch swaps the whole page for a spinner each time.)
  const [live, setLive] = useState<BillingData | null>(null);
  const view = live ?? data;
  const returning = new URLSearchParams(window.location.search).get("paynow") === "return";
  const start = useRef<{ key: string | null; blocked: boolean } | null>(null);
  const refetchAuthRef = useRef(refetchAuth);
  refetchAuthRef.current = refetchAuth;

  useEffect(() => {
    if (returning) showFlash("Payment received by Paynow. It takes effect as soon as Paynow confirms it — usually within a minute.");
  }, [returning, showFlash]);

  const loaded = data !== null;
  useEffect(() => {
    if (!returning || !data) return;
    if (start.current === null) start.current = { key: paidKey(data), blocked: data.access.blocked };
    let attempts = 0;
    let stopped = false;
    const timer = setInterval(async () => {
      attempts++;
      try {
        const fresh = await api.billing.get();
        if (stopped) return;
        // Landed = a paid period that wasn't there before — and, if the page opened
        // blocked, the block is lifted. (A reply with no paid period at all is not it.)
        const key = paidKey(fresh);
        if (key !== null && key !== start.current?.key && (!start.current?.blocked || !fresh.access.blocked)) {
          clearInterval(timer);
          setLive(fresh);
          showFlash("Payment confirmed — thank you.");
          void refetchAuthRef.current(); // so the menu and banner unlock too
          return;
        }
      } catch { /* the next check may get through */ }
      if (attempts >= 30) clearInterval(timer); // ~2 minutes, then leave it to a page refresh
    }, 4000);
    return () => { stopped = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning, loaded]);

  const subscription = (view?.subscription as any) ?? null;
  const plans = view?.plans ?? [];
  const maintenance = view?.maintenance ?? null;
  const access = view?.access;
  const blocked = access?.blocked ?? false;
  const blockedNotice = blocked ? paymentNotice(access) : null;
  const onTrial = view?.plan === "trial" && Boolean(view?.trialEndsAt) && !blocked;

  const [selectedPlan, setSelectedPlan] = useState<string>("byod");
  // How many months to pay for at once: for the maintenance fee, and for a BYOD month.
  const [maintMonths, setMaintMonths] = useState(1);
  const [planMonths, setPlanMonths] = useState(1);
  const prepay = view?.prepay?.length ? view.prepay : FALLBACK_PREPAY;
  useEffect(() => {
    if (subscription?.plan) setSelectedPlan(subscription.plan);
  }, [subscription?.plan]);

  const currentPlan = plans.find((p) => p.key === selectedPlan) ?? plans[0];
  // Standard and Premium are bought once; having one already, the way to keep
  // it going is maintenance — not buying it again.
  const alreadyOwned = Boolean(currentPlan && !currentPlan.recurring && subscription?.plan === currentPlan.key);

  const goToPaynow = (r: { redirectUrl: string } | null | undefined) => {
    if (r?.redirectUrl) window.location.href = r.redirectUrl;
  };
  const { submit: subscribe, loading: subscribing } = useMutation(
    (a: { plan: string; months: number }) => api.billing.subscribe(a.plan, a.months),
    { onSuccess: goToPaynow, onError: (err) => showFlash(err.message, "error") },
  );
  const { submit: payMaintenance, loading: payingMaintenance } = useMutation(
    (months: number) => api.billing.payMaintenance(months),
    { onSuccess: goToPaynow, onError: (err) => showFlash(err.message, "error") },
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
        {blockedNotice && (
          <div role="alert" className={`rounded-xl border p-4 text-sm ${NOTICE_TONE.danger}`}>
            <p className="font-semibold">{blockedNotice.title}</p>
            <p className="mt-1">{blockedNotice.body}</p>
          </div>
        )}

        {onTrial && view?.trialEndsAt && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            You're on a free trial until {new Date(view.trialEndsAt).toLocaleDateString()}. Choose a plan any
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
                  ` · ${blocked ? "ended" : "paid through"} ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${blocked ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {blocked ? "Ended" : "Active"}
            </span>
          </div>
        )}

        {maintenance && (
          <div className="rounded-xl border border-hairline bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">Monthly maintenance</h2>
                <p className="mt-1 text-sm text-muted">
                  {money(maintenance.amountCents)} a month keeps your dashboard open and your tills syncing.
                  Your first month was included when you bought your plan.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${blocked ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                {blocked ? "Overdue" : "Paid"}
              </span>
            </div>

            <p className="mt-3 text-sm text-ink">
              {blocked
                ? `Your last month ended on ${shortDay(maintenance.paidThrough)}.`
                : `Paid through ${shortDay(maintenance.paidThrough)}.`}
            </p>

            <MonthsPicker options={prepay} value={maintMonths} onChange={setMaintMonths} />
            <p className="mt-2 text-xs text-muted">
              {maintMonths === 1 ? "One month" : `${maintMonths} months`} covers you until{" "}
              {shortDay(coveredUntil(maintenance.paidThrough, maintMonths).toISOString())}
              {maintMonths > 1 && costFor(maintenance.amountCents, maintMonths, prepay) < maintenance.amountCents * maintMonths
                ? ` — you save ${money(maintenance.amountCents * maintMonths - costFor(maintenance.amountCents, maintMonths, prepay))}`
                : ""}.
            </p>

            <button
              onClick={() => payMaintenance(maintMonths)}
              disabled={payingMaintenance}
              className={`mt-4 w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 ${
                blocked || (access?.daysLeft ?? 99) <= 5
                  ? "bg-brand-500 text-white hover:bg-brand-600"
                  : "border border-hairline bg-surface text-ink hover:bg-canvas"
              }`}
            >
              {payingMaintenance
                ? "Redirecting to Paynow…"
                : maintMonths === 1
                  ? `Pay ${money(maintenance.amountCents)} maintenance with Paynow`
                  : `Pay ${money(costFor(maintenance.amountCents, maintMonths, prepay))} for ${maintMonths} months with Paynow`}
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              {blocked
                ? "One payment reopens everything from today — you're not charged for the months in between."
                : "Paying early adds to the days you have left."}
              {" "}Nothing is charged automatically — you pay when you choose, and we'll remind you before it's due.
            </p>
            {!user?.phone && (
              <p className="mt-1 text-center text-xs text-muted">
                Want a text as well as an email?{" "}
                <Link to="/settings/account" className="font-medium text-brand-600 hover:underline">Add your mobile number</Link>.
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="font-semibold text-ink">{subscription ? "Plans" : "Choose a plan"}</h2>
          <p className="mt-1 text-xs text-muted">
            BYOD is billed monthly. Standard and Premium are bought once — hardware and your first month
            included — then a monthly maintenance fee from the second month (
            {plans.filter((p) => p.maintenanceCents !== null).map((p) => `${p.label} ${money(p.maintenanceCents!)}`).join(", ")}).
          </p>
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
                {p.maintenanceCents !== null && (
                  <div className="text-xs text-muted">then {money(p.maintenanceCents)}/mo maintenance from month 2</div>
                )}
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

          {currentPlan && alreadyOwned && (
            <p className="mt-4 border-t border-hairline pt-4 text-sm text-muted">
              {maintenance
                ? `You already have ${currentPlan.label}. Pay the monthly maintenance above to keep it running — there's nothing to buy again.`
                : `You already have ${currentPlan.label}, and nothing more is due on it.`}
            </p>
          )}

          {currentPlan && !alreadyOwned && (
            <>
              {currentPlan.recurring && <MonthsPicker options={prepay} value={planMonths} onChange={setPlanMonths} />}
              <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
                <span className="text-sm text-muted">Total due now</span>
                <span className="text-xl font-semibold text-ink">
                  {money(currentPlan.recurring ? costFor(currentPlan.amountCents, planMonths, prepay) : currentPlan.amountCents)}
                  {currentPlan.recurring ? (planMonths === 1 ? " for the first month" : ` for ${planMonths} months`) : ""}
                </span>
              </div>
              {!currentPlan.recurring && (
                <p className="mt-1 text-right text-xs text-muted">Includes your first month.</p>
              )}

              <button
                onClick={() => subscribe({ plan: currentPlan.key, months: currentPlan.recurring ? planMonths : 1 })}
                disabled={subscribing}
                className="mt-4 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {subscribing
                  ? "Redirecting to Paynow…"
                  : `Pay ${money(currentPlan.recurring ? costFor(currentPlan.amountCents, planMonths, prepay) : currentPlan.amountCents)} with Paynow`}
              </button>
              <p className="mt-2 text-center text-xs text-muted">
                {currentPlan.recurring
                  ? "Nothing is charged automatically — you pay when you choose, and we'll remind you before it's due. Pay 6 months and get 1 free, or 12 months and get 2 free."
                  : `One payment now. From the second month, ${money(currentPlan.maintenanceCents ?? 0)} maintenance a month — you pay it when you choose (we'll remind you before it's due), and 6 months at once gets 1 free, 12 gets 2 free.`}
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
