import { Head, Link, usePage } from "@inertiajs/react";
import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout";
import type { SharedProps } from "../../lib/types";

interface Kpis {
  revenueTodayCents: number;
  ordersToday: number;
  totalProducts: number;
  activeStaff: number;
}
interface GettingStarted {
  hasProduct: boolean;
  hasSale: boolean;
  hasPaymentSetup: boolean;
  hasFiscal: boolean;
}
interface TrendPoint {
  date: string;
  revenue_cents: number;
  count: number;
}
interface CategorySlice {
  category_id: string | null;
  name: string;
  revenue_cents: number;
  share_percent: number;
}
interface Props extends SharedProps {
  kpis: Kpis;
  gettingStarted: GettingStarted;
  trend: TrendPoint[];
  categories: CategorySlice[];
  deviceCount: number;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const SLICE_COLORS = ["#1d4ed8", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

export default function DashboardIndex() {
  const { kpis, gettingStarted, trend, categories, tenant, auth } = usePage<Props>().props;
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  const steps = [
    { key: "hasProduct", label: "Add your first product", href: "/products/create", done: gettingStarted.hasProduct },
    { key: "hasSale", label: "Make your first sale", href: "/pos", done: gettingStarted.hasSale },
    { key: "hasPaymentSetup", label: "Connect a payment provider (Paynow or Stripe)", href: "/settings/branding", done: gettingStarted.hasPaymentSetup },
    { key: "hasFiscal", label: "Request ZIMRA Fiscalisation", href: "/settings/branding", done: gettingStarted.hasFiscal, optional: true },
  ];
  const completedCount = steps.filter((s) => s.done).length;

  const maxRevenue = Math.max(1, ...trend.map((t) => t.revenue_cents));
  const isAdmin = auth.user?.role === "owner" || auth.user?.role === "manager";

  return (
    <AppLayout>
      <Head title="Dashboard" />

      <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-muted">
        Welcome to Wivae{tenant ? `, ${tenant.name}` : ""} — your portal is ready
      </p>

      {!checklistDismissed && completedCount < steps.length && (
        <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-brand-700">
              <IconRocket />
              Getting Started
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-brand-700">
                {completedCount}/{steps.length}
              </span>
            </h2>
            <button
              onClick={() => setChecklistDismissed(true)}
              className="text-brand-400 hover:text-brand-700"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {steps.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2.5 text-sm hover:ring-1 hover:ring-brand-200"
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                    s.done ? "border-positive bg-positive text-white" : "border-hairline"
                  }`}
                >
                  {s.done && <IconCheck />}
                </span>
                <span className={s.done ? "text-muted line-through" : ""}>{s.label}</span>
                {s.optional && <span className="ml-auto text-xs text-muted">(optional)</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {tenant?.onTrial && tenant.trialEnd && (
        <TrialCard endsAt={tenant.trialEnd} canManage={isAdmin} />
      )}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Today's Revenue" value={money(kpis.revenueTodayCents)} icon={<IconDollar />} tint="bg-blue-500" />
        <KpiCard label="Today's Orders" value={String(kpis.ordersToday)} icon={<IconCart />} tint="bg-green-500" />
        <KpiCard label="Total Products" value={String(kpis.totalProducts)} icon={<IconBox />} tint="bg-purple-500" />
        <KpiCard label="Active Staff" value={String(kpis.activeStaff)} icon={<IconUsers />} tint="bg-orange-500" />
      </div>

      {/* Revenue trend + category split */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="anim-slide-up rounded-2xl border border-hairline bg-surface p-5 shadow-xs">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Revenue This Week</h2>
          {trend.every((t) => t.revenue_cents === 0) ? (
            <EmptyChart label="No sales yet this week." />
          ) : (
            <div className="flex h-40 items-end gap-1.5">
              {trend.map((t) => (
                <div
                  key={t.date}
                  className="flex-1 rounded-t bg-brand-500/80 transition-all hover:bg-brand-600"
                  style={{ height: `${Math.max(3, (t.revenue_cents / maxRevenue) * 100)}%` }}
                  title={`${t.date}: ${money(t.revenue_cents)} · ${t.count} sales`}
                />
              ))}
            </div>
          )}
        </section>

        <section className="anim-slide-up rounded-2xl border border-hairline bg-surface p-5 shadow-xs">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Sales by Category</h2>
          {categories.length === 0 ? (
            <EmptyChart label="No category sales yet." />
          ) : (
            <ul className="space-y-2.5">
              {categories.slice(0, 6).map((c, i) => (
                <li key={c.category_id ?? "uncategorised"}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-ink">{c.name}</span>
                    <span className="tabular-nums text-muted">{c.share_percent}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.share_percent}%`, background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

function KpiCard({ label, value, icon, tint }: { label: string; value: string; icon: React.ReactNode; tint: string }) {
  return (
    <div className="anim-pop-in rounded-2xl border border-hairline bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted uppercase tracking-wider">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl text-white shadow-sm ${tint}`}>{icon}</span>
      </div>
      <p className="font-display font-tabular mt-3 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function TrialCard({ endsAt, canManage }: { endsAt: string; canManage: boolean }) {
  const days = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-positive/20 bg-positive/5 p-5">
      <div className="flex items-center gap-3">
        <span className="text-positive">
          <IconSparkle />
        </span>
        <div>
          <p className="font-semibold text-positive">
            Free trial — {days} day{days === 1 ? "" : "s"} left
          </p>
          <p className="text-sm text-muted">You have full access to everything. Choose a plan any time to keep going after the trial.</p>
        </div>
      </div>
      {canManage && (
        <Link
          href="/settings/branding"
          className="shrink-0 rounded-lg bg-positive px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Choose a Plan
        </Link>
      )}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <p className="grid h-40 place-items-center text-sm text-muted">{label}</p>;
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IconRocket() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 19 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>; }
function IconCheck() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function IconDollar() { return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>; }
function IconCart() { return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6" /></svg>; }
function IconBox() { return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>; }
function IconUsers() { return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 8.5a3 3 0 1 1 3.5 3M21.5 20a5.5 5.5 0 0 0-4-5.3" /></svg>; }
function IconSparkle() { return <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>; }
