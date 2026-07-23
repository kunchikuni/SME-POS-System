import { Head, Link, router, usePage } from "@inertiajs/react";
import AppLayout from "../../Layouts/AppLayout";

interface Sale {
    id: string;
    occurred_at: string;
    cashier: string;
    table: string | null;
    item_count: number;
    items: string;
    methods: string[];
    total_cents: number;
    currency: string;
}
interface PaginatedSales {
    data: Sale[];
    links: { url: string | null; label: string; active: boolean }[];
    current_page: number;
    last_page: number;
}
interface Props {
    sales: PaginatedSales;
    days: number;
    [key: string]: unknown;
}

const money = (cents: number, currency = "USD") => `${currency === "USD" ? "$" : currency + " "}${(cents / 100).toFixed(2)}`;

function setPeriod(days: number) {
    router.get("/orders", { days }, { preserveScroll: true });
}

/**
 * Every sale, who rang it up, and what was in it — the direct answer to "who
 * made which sale." Read-only: sales are immutable once synced (docs §5.2).
 */
export default function OrdersIndex() {
    const { sales, days } = usePage<Props>().props;

    return (
        <AppLayout>
            <Head title="Orders" />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-ink">Orders</h1>
                    <p className="mt-1 text-sm text-muted">Every sale, with who rang it up.</p>
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

            <div className="mt-6 overflow-hidden rounded-xl border border-hairline bg-surface">
                {sales.data.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted">No orders in this period yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-canvas text-left text-xs text-muted">
                            <tr>
                                <th className="px-4 py-3 font-medium">Time</th>
                                <th className="px-4 py-3 font-medium">Cashier</th>
                                <th className="px-4 py-3 font-medium">Items</th>
                                <th className="px-4 py-3 font-medium">Table</th>
                                <th className="px-4 py-3 font-medium">Payment</th>
                                <th className="px-4 py-3 text-right font-medium">Total</th>
                            </tr>
                            </thead>
                            <tbody>
                            {sales.data.map((s) => (
                                <tr key={s.id} className="border-t border-hairline">
                                    <td className="px-4 py-3 text-muted">
                                        {new Date(s.occurred_at).toLocaleString(undefined, {
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-ink">{s.cashier}</td>
                                    <td className="max-w-xs truncate px-4 py-3 text-muted" title={s.items}>
                                        {s.item_count} item{s.item_count === 1 ? "" : "s"} — {s.items}
                                    </td>
                                    <td className="px-4 py-3 text-muted">{s.table ?? "—"}</td>
                                    <td className="px-4 py-3">
                                        {s.methods.map((m) => (
                                            <span key={m} className="mr-1 rounded-full bg-canvas px-2 py-0.5 text-xs capitalize text-muted">
                        {m}
                      </span>
                                        ))}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                                        {money(s.total_cents, s.currency)}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {sales.last_page > 1 && (
                <div className="mt-4 flex justify-center gap-1">
                    {sales.links.map((l, i) => (
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
