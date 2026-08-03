import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";
import { useState } from "react";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const SLICE_COLORS = ["#7c3aed", "#059669", "#d97706", "#dc2626", "#4f46e5", "#0891b2"];

export default function AnalyticsIndex() {
  usePageTitle("Analytics");
  const [range, setRange] = useState(30);
  const { data, loading } = useQuery(() => api.analytics.overview(range), [range]);

  const salesByDay = (data?.salesByDay ?? []) as { date: string; total_cents: number; count: number }[];
  const topProducts = (data?.topProducts ?? []) as { name: string; revenue: number; units_sold: number }[];
  const paymentMethods = (data?.paymentMethods ?? []) as { method: string; _sum: { amountCents: number }; _count: number }[];
  const totalRevenue = salesByDay.reduce((s, d) => s + (d.total_cents ?? 0), 0);
  const maxRevenue = Math.max(1, ...salesByDay.map(d => d.total_cents ?? 0));

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-muted">Revenue and performance insights</p>
        </div>
        <select value={range} onChange={(e) => setRange(Number(e.target.value))}
          className="rounded-xl border border-hairline bg-surface px-3 py-2 text-sm">
          {[7, 14, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center"><Spinner /></div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Revenue trend */}
          <section className="rounded-xl border border-hairline bg-surface p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-muted">Revenue — Last {range} days</h2>
              <span className="font-semibold text-ink">{money(totalRevenue)}</span>
            </div>
            {salesByDay.length === 0 ? <EmptyChart label="No sales in this period." /> : (
              <div className="flex h-40 items-end gap-0.5">
                {salesByDay.map((d) => (
                  <div key={d.date} title={`${d.date}: ${money(d.total_cents ?? 0)}`}
                    className="flex-1 min-w-0 rounded-t bg-brand-500/80 hover:bg-brand-600 transition-all"
                    style={{ height: `${Math.max(3, ((d.total_cents ?? 0) / maxRevenue) * 100)}%` }} />
                ))}
              </div>
            )}
          </section>

          {/* Top products */}
          <section className="rounded-xl border border-hairline bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium text-muted">Top Products</h2>
            {topProducts.length === 0 ? <EmptyChart label="No sales yet." /> : (
              <ul className="space-y-2">
                {topProducts.slice(0, 8).map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate text-ink">{p.name}</span>
                    <span className="ml-2 shrink-0 tabular-nums text-muted">{money(Number(p.revenue))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Payment methods */}
          <section className="rounded-xl border border-hairline bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium text-muted">Payment Methods</h2>
            {paymentMethods.length === 0 ? <EmptyChart label="No payments yet." /> : (
              <ul className="space-y-2.5">
                {paymentMethods.map((m, i) => {
                  const total = paymentMethods.reduce((s, x) => s + (x._sum?.amountCents ?? 0), 0);
                  const pct = total > 0 ? Math.round(((m._sum?.amountCents ?? 0) / total) * 100) : 0;
                  return (
                    <li key={m.method}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize text-ink">{m.method}</span>
                        <span className="tabular-nums text-muted">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppLayout>
  );
}

function EmptyChart({ label }: { label: string }) { return <p className="grid h-32 place-items-center text-sm text-muted">{label}</p>; }
function Spinner() { return <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />; }
