import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery } from "../../lib/hooks.js";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Link, useSearchParams } from "react-router-dom";
import { GetSelling } from "./GetSelling.js";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const SLICE_COLORS = ["#7c3aed", "#059669", "#d97706", "#dc2626", "#4f46e5", "#0891b2"];

export default function DashboardIndex() {
  usePageTitle("Dashboard");
  const { user, tenant } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "manager";
  const [searchParams] = useSearchParams();

  const { data: summary, loading } = useQuery(() => api.dashboard.summary(), []);
  const { data: analytics } = useQuery(() => api.analytics.overview(7), []);

  const trend = (analytics?.salesByDay ?? []) as { date: string; total_cents: number; count: number }[];
  const maxRevenue = Math.max(1, ...trend.map((t) => t.total_cents ?? 0));

  if (loading || !summary) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center"><Spinner /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-muted">
        Welcome to Wivae{tenant ? `, ${tenant.name}` : ""} — your portal is ready
      </p>

      {/* Sign-up → first sale. Replaces the old "Getting Started" card, whose
          ticks weren't real ("Configure your settings" was ticked for every
          owner; "first sale" only counted today's sales). */}
      {isAdmin && <GetSelling welcome={searchParams.get("welcome") === "1"} />}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Today's Revenue" value={money(summary.today.totalCents)} icon={<IconDollar />} tint="bg-blue-500" />
        <KpiCard label="Today's Orders" value={String(summary.today.count)} icon={<IconCart />} tint="bg-green-500" />
        <KpiCard label="Total Products" value={String(summary.products)} icon={<IconBox />} tint="bg-purple-500" />
        <KpiCard label="Open Tasks" value={String(summary.openTasks)} icon={<IconTasks />} tint="bg-orange-500" />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-muted">Revenue This Week</h2>
          {trend.every((t) => (t.total_cents ?? 0) === 0) || trend.length === 0 ? (
            <EmptyChart label="No sales yet this week." />
          ) : (
            <div className="flex h-40 items-end gap-1.5">
              {trend.map((t) => (
                <div
                  key={t.date}
                  className="flex-1 rounded-t bg-brand-500/80 transition-all hover:bg-brand-600"
                  style={{ height: `${Math.max(3, ((t.total_cents ?? 0) / maxRevenue) * 100)}%` }}
                  title={`${t.date}: ${money(t.total_cents ?? 0)} · ${t.count} sales`}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-muted">Quick Stats</h2>
          <ul className="space-y-3">
            <StatRow label="Month's Revenue" value={money(summary.month.totalCents)} />
            <StatRow label="Month's Orders" value={String(summary.month.count)} />
            <StatRow label="Low Stock Items" value={String(summary.lowStock)} accent={summary.lowStock > 0} />
            <StatRow label="Open Tasks" value={String(summary.openTasks)} accent={summary.openTasks > 0} />
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <li className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${accent ? "text-amber-600" : "text-ink"}`}>{value}</span>
    </li>
  );
}

function KpiCard({ label, value, icon, tint }: { label: string; value: string; icon: React.ReactNode; tint: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg text-white ${tint}`}>{icon}</span>
      </div>
      <p className="font-display font-tabular mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <p className="grid h-40 place-items-center text-sm text-muted">{label}</p>;
}

function Spinner() {
  return <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IconRocket() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 19 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>; }
function IconCheck() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function IconDollar() { return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>; }
function IconCart() { return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6" /></svg>; }
function IconBox() { return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>; }
function IconTasks() { return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M4 6h2l1.5 1.5L11 4M4 12h2l1.5 1.5L11 10M14 6h6M14 12h6" /></svg>; }
