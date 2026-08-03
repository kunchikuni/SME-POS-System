import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery } from "../../lib/hooks.js";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function TransactionsIndex() {
  usePageTitle("Transactions");
  const { data, loading } = useQuery(
    () => fetch('/transactions', { credentials: 'include', headers: { Accept: 'application/json' } }).then(r => r.json()),
    []
  );
  const payments = data?.payments ?? [];
  const summary = (data?.summary ?? []) as { method: string; _sum: { amountCents: number }; _count: number }[];

  return (
    <AppLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Transactions</h1>
      <p className="mt-1 text-sm text-muted">Payments ledger</p>

      {/* Method summary */}
      {summary.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {summary.map((s: any) => (
            <div key={s.method} className="rounded-xl border border-hairline bg-surface px-4 py-3 text-sm">
              <p className="capitalize font-medium text-ink">{s.method}</p>
              <p className="text-lg font-semibold tabular-nums">{money(s._sum?.amountCents ?? 0)}</p>
              <p className="text-xs text-muted">{s._count} txns</p>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="mt-8 flex justify-center"><Spinner /></div> : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-canvas text-left text-xs font-semibold uppercase tracking-widest text-muted">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {payments.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No transactions yet.</td></tr>}
              {payments.map((p: any) => (
                <tr key={p.id} className="hover:bg-canvas/50">
                  <td className="px-4 py-3 text-muted">{new Date(p.sale?.occurredAt).toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize text-ink">{p.method}</td>
                  <td className="px-4 py-3 text-muted">{p.sale?.branch?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(p.amountCents ?? 0)}</td>
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
