import { useMemo, useState } from 'react';
import { enqueue } from '../sync/outbox';
import { syncManager } from '../sync/syncManager';
import { db } from '../db/database';
import type { Product, StockLevel } from '../types/contract';

/**
 * Offline restocking — the till-side counterpart to the dashboard's manual
 * "restock" action. Queues a stock.receive mutation through the same
 * outbox a sale uses, so a delivery can be received without a live
 * connection (docs: "restocking should also be possible offline").
 *
 * Gated to owner/manager in the caller (see RetailTill), matching the
 * server's own ADMIN_ROLES check on POST /products/:id/restock — a
 * restock entry has no corresponding money in, so nothing else cross-checks
 * it against reality the way a sale's payment total does; unlike ringing up
 * a sale, this isn't safe to leave open to every cashier login.
 */
export function ReceiveStock({
                                 branchId,
                                 products,
                                 stockRows,
                                 onClose,
                             }: {
    branchId: string;
    products: Product[];
    stockRows: StockLevel[];
    onClose: () => void;
}) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Product | null>(null);
    const [qty, setQty] = useState('');
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState<{ name: string; qty: number } | null>(null);

    const currentQty = (productId: string) =>
        stockRows.find((s) => s.product_id === productId)?.quantity ?? 0;

    const results = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return products
            .filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q)
            .slice(0, 8);
    }, [search, products]);

    async function submit() {
        if (!selected) return;
        const parsed = parseInt(qty, 10);
        if (!Number.isInteger(parsed) || parsed < 1) return;

        setSaving(true);
        try {
            const id = crypto.randomUUID();
            // Queue AND bump the local level in one transaction, mirroring
            // checkout.ts's optimistic decrement. Previously only the queue
            // entry was written, so the delivery didn't show on this till
            // until a pull brought the server's level back — and a cursor bug
            // meant that pull never came. The next pull replaces this with the
            // server's absolute level, which includes the receipt once acked
            // (flush runs before pull), so there's no double count.
            await db.transaction('rw', db.outbox, db.stock, async () => {
                await enqueue(id, {
                    type: 'stock.receive',
                    id,
                    product_id: selected.id,
                    branch_id: branchId,
                    qty: parsed,
                    occurred_at: new Date().toISOString(),
                });
                const level = await db.stock.get(selected.id);
                await db.stock.put({ product_id: selected.id, quantity: (level?.quantity ?? 0) + parsed });
            });
            void syncManager.sync(); // push now rather than on the next 30s poll; safe offline
            setDone({ name: selected.name, qty: parsed });
            setSelected(null);
            setQty('');
            setSearch('');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 anim-fade-in" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-sm anim-pop-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">Receive stock</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close">
                        ✕
                    </button>
                </div>

                {done && (
                    <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300 ring-1 ring-emerald-500/20">
                        Queued +{done.qty} for {done.name}. It'll sync next time this till is online — this works offline, it doesn't need a connection now.
                    </div>
                )}

                <div className="mt-4">
                    {!selected ? (
                        <>
                            <input
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search product or scan barcode…"
                                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                            {results.length > 0 && (
                                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto dark-scroll">
                                    {results.map((p) => (
                                        <li key={p.id}>
                                            <button
                                                onClick={() => setSelected(p)}
                                                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/6 transition-colors"
                                            >
                                                <span>{p.name}</span>
                                                <span className="text-xs text-slate-500">On hand: {currentQty(p.id)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {search.trim() && results.length === 0 && (
                                <p className="mt-2 text-xs text-slate-500">No product matches "{search}".</p>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                                <div>
                                    <p className="text-sm font-medium text-white">{selected.name}</p>
                                    <p className="text-xs text-slate-500">Currently on hand: {currentQty(selected.id)}</p>
                                </div>
                                <button
                                    onClick={() => setSelected(null)}
                                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                >Change</button>
                            </div>

                            <label className="mt-4 block text-xs font-medium text-slate-400">Quantity received</label>
                            <input
                                autoFocus
                                inputMode="numeric"
                                value={qty}
                                onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="0"
                                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm tabular-nums text-white placeholder-slate-600 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />

                            <button
                                onClick={submit}
                                disabled={saving || !qty || parseInt(qty, 10) < 1}
                                className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                            >
                                {saving ? 'Saving…' : 'Add to stock'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
