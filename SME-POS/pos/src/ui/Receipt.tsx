import { formatMoney } from '../lib/money';
import { deviceBridge } from '../hardware/DeviceBridge';
import type { SalePayload } from '../types/contract';

/**
 * The receipt for a completed sale. Printing goes through the DeviceBridge, so
 * the same view works whether the host is a browser or a native shell. The
 * "provisional" note reflects that fiscal signing (ZIMRA) happens on sync in a
 * later phase — the sale is real now; the fiscal receipt catches up (§9.2).
 *
 * DELIBERATELY neutral (green), not violet/orange: a completed sale isn't a
 * "shopping mode" moment, and this screen is reached from both RetailTill and
 * RestaurantTill, so it shouldn't borrow either one's brand identity.
 *
 * The #receipt CARD ITSELF stays genuinely light (white bg, dark text) even
 * in dark mode — not just a print-media override. printerService.ts falls
 * back to window.print() on tills with no connected thermal printer, and
 * that prints the page as rendered; a dark receipt risks wasted ink or, on
 * browsers that drop backgrounds when printing, light text turning invisible
 * on white paper. The @media print rules in index.css are a second layer of
 * protection on top of this, not a replacement for it.
 */
export function Receipt({
                            sale,
                            tenantName,
                            branchName,
                            onDone,
                        }: {
    sale: SalePayload;
    tenantName: string;
    branchName: string;
    onDone: () => void;
}) {
    return (
        <div className="grid min-h-dvh place-items-center pos-bg p-4 sm:p-6 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.10)_0%,transparent_65%)]" />

            <div className="relative z-10 w-full max-w-xs anim-pop-in">
                {/* Success badge */}
                <div className="mb-4 flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl ring-1 ring-emerald-500/30">
                        ✓
                    </div>
                </div>

                {/* The receipt card — always light, on purpose (see docblock) */}
                <div id="receipt" className="rounded-2xl bg-white p-6 shadow-lg">
                    <div className="text-center">
                        <h1 className="text-lg font-semibold text-slate-900">{tenantName}</h1>
                        <p className="text-xs text-slate-500">{branchName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                            {new Date(sale.occurred_at).toLocaleString()}
                        </p>
                    </div>

                    <div className="my-4 border-t border-dashed border-slate-200" />

                    <ul className="space-y-1 text-sm">
                        {sale.lines.map((line) => (
                            <li key={line.id} className="flex justify-between">
                <span className="text-slate-700">
                  {line.qty} × {line.name}
                </span>
                                <span className="tabular-nums text-slate-900">
                  {formatMoney(line.line_total_cents, sale.currency)}
                </span>
                            </li>
                        ))}
                    </ul>

                    <div className="my-4 border-t border-dashed border-slate-200" />

                    <div className="flex justify-between text-sm text-slate-500">
                        <span>Net (ex VAT)</span>
                        <span className="tabular-nums">{formatMoney(sale.subtotal_cents, sale.currency)}</span>
                    </div>
                    {sale.tax_cents > 0 && (
                        <div className="flex justify-between text-sm text-slate-500">
                            <span>VAT (included)</span>
                            <span className="tabular-nums">{formatMoney(sale.tax_cents, sale.currency)}</span>
                        </div>
                    )}
                    {sale.gratuity_cents > 0 && (
                        <div className="flex justify-between text-sm text-slate-500">
                            <span>Gratuity</span>
                            <span className="tabular-nums">{formatMoney(sale.gratuity_cents, sale.currency)}</span>
                        </div>
                    )}
                    <div className="mt-1 flex justify-between text-base font-semibold text-slate-900">
                        <span>Total</span>
                        <span className="tabular-nums">{formatMoney(sale.total_cents, sale.currency)}</span>
                    </div>

                    {sale.payments.map((p) => (
                        <div key={p.id} className="mt-1 flex justify-between text-sm text-slate-500">
                            <span className="capitalize">{p.method}</span>
                            <span className="tabular-nums">{formatMoney(p.amount_cents, p.currency)}</span>
                        </div>
                    ))}

                    <p className="mt-4 text-center text-[11px] text-slate-400">
                        Provisional receipt · thank you
                    </p>
                </div>

                <div className="mt-4 flex gap-3 print:hidden">
                    <button
                        onClick={() => void deviceBridge.printReceipt({ sale, tenantName, branchName })}
                        className="btn-neutral-outline flex-1 rounded-xl py-2.5 font-medium text-slate-200"
                    >
                        Print
                    </button>
                    <button
                        onClick={onDone}
                        className="btn-neutral flex-1 rounded-xl py-2.5 font-semibold text-white"
                    >
                        New sale
                    </button>
                </div>
            </div>
        </div>
    );
}
