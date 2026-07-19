import { Head, usePage } from "@inertiajs/react";
import AppLayout from "../../Layouts/AppLayout";

interface ReorderRow {
  product_id: string;
  name: string;
  on_hand: number;
  threshold: number;
  sold_30d: number;
  days_left: number | null;
}
interface PricingRow {
  product_id: string;
  name: string;
  margin_percent: number | null;
  qty_sold_30d: number;
  flag: "low_margin" | "strong_margin";
}
interface DeadStockRow {
  product_id: string;
  name: string;
  quantity: number;
}
interface Props {
  reorder: ReorderRow[];
  pricing: PricingRow[];
  deadStock: DeadStockRow[];
  [key: string]: unknown;
}

export default function AiInsightsIndex() {
  const { reorder, pricing, deadStock } = usePage<Props>().props;

  return (
    <AppLayout>
      <Head title="Insights" />
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Insights</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Rule-based, computed directly from your last 30 days of sales, stock, and margin —
        not narrative text from a language model. Every number below is a real read from
        your data.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Reorder soon</h2>
        <p className="text-xs text-slate-400">Low stock, still selling — most urgent first.</p>
        {reorder.length === 0 ? (
          <Empty label="Nothing urgent — everything low on shelf isn't currently selling." />
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {reorder.map((r) => (
              <li key={r.product_id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-800">{r.name}</p>
                  <p className="text-xs text-slate-400">
                    {r.on_hand} on hand · {r.sold_30d} sold in 30 days
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  {r.days_left !== null ? `~${r.days_left}d left` : "low stock"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Pricing worth a look</h2>
        <p className="text-xs text-slate-400">Products with a captured cost, flagged by margin.</p>
        {pricing.length === 0 ? (
          <Empty label="No pricing flags — capture product costs to see margin insight here." />
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {pricing.map((p) => (
              <li key={p.product_id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {p.margin_percent}% margin · {p.qty_sold_30d} sold in 30 days
                  </p>
                </div>
                {p.flag === "low_margin" ? (
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                    Low margin — review price
                  </span>
                ) : (
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    Strong seller — protect price
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Dead stock</h2>
        <p className="text-xs text-slate-400">In stock, zero sales in 30 days.</p>
        {deadStock.length === 0 ? (
          <Empty label="Nothing gathering dust — everything stocked has sold." />
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {deadStock.map((d) => (
              <li key={d.product_id} className="flex items-center justify-between py-3">
                <p className="font-medium text-slate-800">{d.name}</p>
                <span className="tabular-nums text-slate-500">{d.quantity} on hand</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppLayout>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">{label}</p>;
}
