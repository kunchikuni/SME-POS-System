import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AiInsightsIndex() {
  usePageTitle("AI Insights");
  const { data, loading } = useQuery(() => api.aiInsights.get(), []);
  const deadStock = (data?.deadStock ?? []) as { id: string; name: string; sku: string }[];
  const lowMargin = (data?.lowMargin ?? []) as { id: string; name: string; sku: string; priceCents: number; costCents: number }[];

  return (
    <AppLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">AI Insights</h1>
      <p className="mt-1 text-sm text-muted">Rule-based inventory and pricing analysis</p>

      {loading ? <div className="mt-8 flex justify-center"><Spinner /></div> : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-hairline bg-surface p-5">
            <h2 className="mb-1 font-semibold text-ink">Dead Stock</h2>
            <p className="mb-4 text-sm text-muted">Products with no sales in the last 30 days</p>
            {deadStock.length === 0 ? (
              <p className="text-sm text-positive">✓ No dead stock detected</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {deadStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium text-ink">{p.name}</span>
                    <span className="font-mono text-xs text-muted">{p.sku}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-hairline bg-surface p-5">
            <h2 className="mb-1 font-semibold text-ink">Low Margin Products</h2>
            <p className="mb-4 text-sm text-muted">Products where cost is &gt; 60% of price</p>
            {lowMargin.length === 0 ? (
              <p className="text-sm text-positive">✓ No low-margin products detected</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {lowMargin.map((p) => {
                  const margin = p.costCents && p.priceCents ? Math.round((1 - p.costCents / p.priceCents) * 100) : null;
                  return (
                    <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="font-medium text-ink">{p.name}</p>
                        <p className="text-xs text-muted">
                          Cost: {money(p.costCents ?? 0)} · Price: {money(p.priceCents)}
                        </p>
                      </div>
                      {margin !== null && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                          {margin}% margin
                        </span>
                      )}
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
function Spinner() { return <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />; }
