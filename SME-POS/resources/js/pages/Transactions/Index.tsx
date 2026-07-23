import { Head, Link, router, usePage } from "@inertiajs/react";
import AppLayout from "../../Layouts/AppLayout";

interface MethodTotal {
    method: string;
    count: number;
    total_cents: number;
}
interface LedgerRow {
    id: string;
    method: string;
    amount_cents: number;
    currency: string;
    occurred_at: string | null;
    cashier: string;
    sale_id: string;
}
interface PaginatedLedger {
    data: LedgerRow[];
    links: { url: string | null; label: string; active: boolean }[];
    last_page: number;
}
interface Props {
    byMethod: MethodTotal[];
    ledger: PaginatedLedger;
    days: number;
    [key: string]: unknown;
}

const money = (cents: number, currency = "USD") => `${currency === "USD" ? "$" : currency + " "}${(cents / 100).toFixed(2)}`;

function setPeriod(days: number) {
    router.get("/transactions", { days }, { preserveScroll: true });
}

/**
 * The financial ledger: how the money came in, by tender method. Distinct
 * from Orders (which answers what was sold and by whom) — this is a payments
 * view. Every payment is a label the merchant recorded, never money Wivae
 * processed (docs §1, §9.1).
 */
export default function TransactionsIndex() {
    const { byMethod, ledger, days } = usePage<Props>().props;
    const grandTotal = byMethod.reduce((sum, m) => sum + m.total_cents, 0);

    return (
        <AppLayout>
            <Head title="Transactions" />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-ink">Transactions</h1>
                    <p className="mt-1 text-sm text-muted">How payment came in, by method.</p>
                </div>
                <div className="flex gap-1 rounded-lg bg-canvas p-1">
                    {[1, 7, 30].map((d) => (
                        <button
                            key={d}
                            onClick={() => setPeriod(d)}
                            className={`rounded-md px-3 py-1 text-sm font-medium ${
                                days === d ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                            }`}
                        >
                            {d === 1 ? "Today" : `${d}d`}
                        </button>
                    ))}
                </div>
            </div>

            {byMethod.length === 0 ? (
                <p className="mt-6 rounded-xl border border-hairline bg-surface py-16 text-center text-sm text-muted">
                    No transactions in this period yet.
                </p>
            ) : (
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    {byMethod.map((m) => (
                        <div key={m.method} className="rounded-xl border border-hairline bg-surface p-4">
                            <div className="text-xs font-medium capitalize text-muted">{m.method}</div>
                            <div className="mt-1 text-lg font-semibold tabular-nums text-ink">
                                {money(m.total_cents)}
                            </div>
                            <div className="text-xs text-muted">
                                {m.count} txn{m.count === 1 ? "" : "s"} ·{" "}
                                {grandTotal > 0 ? Math.round((m.total_cents / grandTotal) * 100) : 0}%
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-6 overflow-hidden rounded-xl border border-hairline bg-surface">
                {ledger.data.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted">Nothing to show.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-canvas text-left text-xs text-muted">
                            <tr>
                                <th className="px-4 py-3 font-medium">Time</th>
                                <th className="px-4 py-3 font-medium">Method</th>
                                <th className="px-4 py-3 font-medium">Cashier</th>
                                <th className="px-4 py-3 text-right font-medium">Amount</th>
                            </tr>
                            </thead>
                            <tbody>
                            {ledger.data.map((p) => (
                                <tr key={p.id} className="border-t border-hairline">
                                    <td className="px-4 py-3 text-muted">
                                        {p.occurred_at
                                            ? new Date(p.occurred_at).toLocaleString(undefined, {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })
                                            : "—"}
                                    </td>
                                    <td className="px-4 py-3 capitalize text-ink">{p.method}</td>
                                    <td className="px-4 py-3 text-muted">{p.cashier}</td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                                        {money(p.amount_cents, p.currency)}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {ledger.last_page > 1 && (
                <div className="mt-4 flex justify-center gap-1">
                    {ledger.links.map((l, i) => (
                        <Link
                            key={i}
                            href={l.url ?? "#"}
                            preserveScroll
                            className={`rounded-lg px-3 py-1.5 text-sm ${
                                l.active ? "bg-brand-500 text-white" : "text-muted hover:bg-canvas"
                            } ${!l.url ? "pointer-events-none opacity-40" : ""}`}
                            dangerouslySetInnerHTML={{ __html: l.label }}
                        />
                    ))}
                </div>
            )}
        </AppLayout>
    );
}
