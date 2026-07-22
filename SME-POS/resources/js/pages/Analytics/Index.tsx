import { Head, router, usePage } from "@inertiajs/react";
import AppLayout from "../../Layouts/AppLayout";

interface Overview {
  sale_count: number;
  revenue_cents: number;
  avg_sale_cents: number;
}
interface TrendPoint {
  date: string;
  revenue_cents: number;
  count: number;
}
interface TopProduct {
  product_id: string;
  name: string;
  qty_sold: number;
  revenue_cents: number;
}
interface DeadStock {
  product_id: string;
  name: string;
  quantity: number;
}
interface BranchPerf {
  branch_id: string;
  name: string;
  sale_count: number;
  revenue_cents: number;
}
interface Props {
  days: number;
  overview: Overview;
  trend: TrendPoint[];
  topProducts: TopProduct[];
  deadStock: DeadStock[];
  branches: BranchPerf[];
  [key: string]: unknown;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function setPeriod(days: number) {
  router.get("/analytics", { days }, { preserveScroll: true });
}

export default function AnalyticsIndex() {
  const { days, overview, trend, topProducts, deadStock, branches } = usePage<Props>().props;
  const maxRevenue = Math.max(1, ...trend.map((t) => t.revenue_cents));

  return (
    <AppLayout>
      <Head title="Analytics" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Analytics</h1>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                days === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="Revenue" value={money(overview.revenue_cents)} />
        <Card label="Sales" value={overview.sale_count.toLocaleString()} />
        <Card label="Average sale" value={money(overview.avg_sale_cents)} />
      </div>

      {/* Daily trend */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-700">Revenue, last {days} days</h2>
        {overview.sale_count === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No sales in this period yet.</p>
        ) : (
          <div className="flex h-40 items-end gap-0.5">
            {trend.map((t) => (
              <div
                key={t.date}
                className="flex-1 rounded-t bg-blue-500/80 transition-all hover:bg-blue-600"
                style={{ height: `${Math.max(2, (t.revenue_cents / maxRevenue) * 100)}%` }}
                title={`${t.date}: ${money(t.revenue_cents)} · ${t.count} sales`}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top products */}
        <Panel title="Top products">
          {topProducts.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">Sold</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.product_id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-800">{p.name}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{p.qty_sold}</td>
                    <td className="py-2 text-right tabular-nums text-slate-900">
                      {money(p.revenue_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Panel>

        {/* Dead stock */}
        <Panel title="Dead stock" subtitle="In stock, no sales this period">
          {deadStock.length === 0 ? (
            <Empty label="Nothing gathering dust — every stocked item sold." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">On hand</th>
                </tr>
              </thead>
              <tbody>
                {deadStock.map((p) => (
                  <tr key={p.product_id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-800">{p.name}</td>
                    <td className="py-2 text-right tabular-nums text-amber-600">{p.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Branch performance */}
      <Panel title="Branch performance" className="mt-6">
        {branches.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="pb-2 font-medium">Branch</th>
                <th className="pb-2 text-right font-medium">Sales</th>
                <th className="pb-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.branch_id} className="border-t border-slate-100">
                  <td className="py-2 text-slate-800">{b.name}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{b.sale_count}</td>
                  <td className="py-2 text-right tabular-nums text-slate-900">{money(b.revenue_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Panel>
    </AppLayout>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <div className="mb-3">
        <h2 className="text-sm font-medium text-slate-700">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ label = "No data yet." }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-slate-400">{label}</p>;
}
