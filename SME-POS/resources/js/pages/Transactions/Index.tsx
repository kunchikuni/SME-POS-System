import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery } from "../../lib/hooks.js";
import { api, type TransactionRow } from "../../lib/api.js";
import { DayPicker, METHOD_LABEL, dayHeading, longDate, useDayView } from "../../Components/DayPicker.js";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const time = (d: string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The payments ledger, one day at a time (business local time) — same day
 * picker as Orders. Previously it listed every payment ever with no date
 * filter and no paging, so nothing older than the latest 50 was reachable.
 *
 * The per-method totals count completed sales only; a voided sale's payment
 * is still listed (marked) so the ledger stays complete.
 */
export default function TransactionsIndex() {
    usePageTitle("Transactions");
    const { requestedDate, branchFilter, page, setPage, showDay, showBranch } = useDayView();

    const { data, loading } = useQuery(
        () => api.transactions.list({ page, date: requestedDate, branchId: branchFilter || undefined }),
        [page, requestedDate, branchFilter],
    );
    const { data: branchData } = useQuery(() => api.branches.list(), []);
    const branches = branchData?.branches ?? [];

    const payments = data?.payments ?? [];
    const summary = [...(data?.summary ?? [])].sort((a, b) => (b._sum.amountCents ?? 0) - (a._sum.amountCents ?? 0));
    const total = data?.total ?? 0;
    const perPage = data?.perPage ?? 50;
    const shownDate = data?.date ?? null;
    const today = data?.today ?? null;
    const dayTotal = summary.reduce((sum, s) => sum + (s._sum.amountCents ?? 0), 0);
    const showBranchColumn = branches.length > 1 && !branchFilter;

    return (
        <AppLayout>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-ink">Transactions</h1>
                    <p className="mt-1 text-sm text-muted">{dayHeading(shownDate, today)}</p>
                </div>
                <DayPicker
                    shownDate={shownDate}
                    today={today}
                    onDay={(d) => showDay(d, today)}
                    branches={branches}
                    branchFilter={branchFilter}
                    onBranch={showBranch}
                />
            </div>

            {/* The whole day's totals per payment method (not just this page). */}
            {shownDate && (
                <div className="mt-4 flex flex-wrap gap-3">
                    <div className="rounded-xl border border-hairline bg-surface px-4 py-3 text-sm">
                        <p className="font-medium text-ink">Total received</p>
                        <p className="text-lg font-semibold tabular-nums">{money(dayTotal)}</p>
                        <p className="text-xs text-muted">{summary.reduce((n, s) => n + s._count, 0)} payments</p>
                    </div>
                    {summary.map((s) => (
                        <div key={s.method} className="rounded-xl border border-hairline bg-surface px-4 py-3 text-sm">
                            <p className="font-medium text-ink">{METHOD_LABEL[s.method] ?? s.method}</p>
                            <p className="text-lg font-semibold tabular-nums">{money(s._sum.amountCents ?? 0)}</p>
                            <p className="text-xs text-muted">{s._count} payment{s._count === 1 ? "" : "s"}</p>
                        </div>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="mt-8 flex justify-center">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                </div>
            ) : (
                <>
                    <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="border-b border-hairline bg-canvas text-left text-xs font-semibold uppercase tracking-widest text-muted">
                                <th className="px-4 py-3">{shownDate ? "Time" : "Date"}</th>
                                <th className="px-4 py-3">Method</th>
                                <th className="px-4 py-3">Cashier</th>
                                {showBranchColumn && <th className="px-4 py-3">Branch</th>}
                                <th className="px-4 py-3 text-right">Amount</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                            {payments.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                                        {shownDate ? `No payments on ${shownDate === today ? "this day yet" : longDate(shownDate)}.` : "No transactions yet."}
                                    </td>
                                </tr>
                            )}
                            {payments.map((p: TransactionRow) => {
                                const voided = p.sale?.status === "voided";
                                return (
                                    <tr key={p.id} className={`hover:bg-canvas/50 ${voided ? "opacity-60" : ""}`}>
                                        <td className="px-4 py-3 text-muted tabular-nums">
                                            {p.sale ? (shownDate ? time(p.sale.occurredAt) : new Date(p.sale.occurredAt).toLocaleString()) : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-ink">
                                            {METHOD_LABEL[p.method] ?? p.method}
                                            {p.method === "credit" && p.sale?.customer && (
                                                <span className="block text-xs text-muted">on account: {p.sale.customer.name}</span>
                                            )}
                                            {voided && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">voided</span>}
                                        </td>
                                        <td className="px-4 py-3 text-muted">{p.sale?.cashier?.name ?? "—"}</td>
                                        {showBranchColumn && <td className="px-4 py-3 text-muted">{p.sale?.branch?.name ?? "—"}</td>}
                                        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${voided ? "line-through" : ""}`}>
                                            {money(p.amountCents ?? 0)}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>

                    {total > perPage && (
                        <div className="mt-4 flex justify-center gap-2">
                            <button disabled={page === 1} onClick={() => setPage((n) => n - 1)} className="btn-secondary text-xs disabled:opacity-40">← Prev</button>
                            <span className="px-3 py-1 text-sm text-muted">Page {page} of {Math.ceil(total / perPage)}</span>
                            <button disabled={page * perPage >= total} onClick={() => setPage((n) => n + 1)} className="btn-secondary text-xs disabled:opacity-40">Next →</button>
                        </div>
                    )}
                </>
            )}
        </AppLayout>
    );
}
