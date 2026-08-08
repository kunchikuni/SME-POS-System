import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmt = (d: string) => new Date(d).toLocaleString();

export default function OrdersIndex() {
  usePageTitle("Orders");
  const { data, loading } = useQuery(() => api.analytics.overview(90), []);
  // Orders use a separate endpoint
  const { data: ordersData, loading: ordersLoading } = useQuery(
    () => fetch('/orders', { credentials: 'include', headers: { Accept: 'application/json' } }).then(r => r.json()),
    []
  );

  const sales = ordersData?.sales ?? [];
  const total = ordersData?.total ?? 0;

  return (
    <AppLayout>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Orders</h1>
        <p className="mt-1 text-sm text-muted">{total} total orders</p>
      </div>

      {ordersLoading ? (
        <div className="mt-8 flex justify-center"><Spinner /></div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-canvas text-left text-xs font-semibold uppercase tracking-widest text-muted">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {sales.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No orders yet.</td></tr>}
              {sales.map((s: any) => (
                <tr key={s.id} className="hover:bg-canvas/50">
                  <td className="px-4 py-3 text-muted">{fmt(s.occurredAt)}</td>
                  <td className="px-4 py-3 text-ink">{s.cashier?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{s.branch?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{s.lines?.length ?? 0} item{s.lines?.length !== 1 ? "s" : ""}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(s.totalCents ?? 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.status === "completed" ? "bg-positive/10 text-positive" : "bg-amber-50 text-amber-700"}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}

function Spinner() { return <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />; }
