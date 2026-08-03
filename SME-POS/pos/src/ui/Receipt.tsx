import { formatMoney } from '../lib/money';
import { deviceBridge } from '../hardware/DeviceBridge';
import type { DeviceSession } from '../sync/session';
import type { SalePayload } from '../types/contract';

/**
 * A short, local, human-readable reference — NOT a ZIMRA fiscal receipt
 * number. The real fiscal receipt number (fiscal_devices.receipt_global_no)
 * is assigned server-side once a sale is actually submitted to FDMS, which
 * happens on sync (§9.2) — it doesn't exist yet at the moment a receipt is
 * first printed, often offline. Showing a fabricated "fiscal-looking" number
 * here would be actively misleading on a tax document; this is deliberately
 * styled as a reference, not a fiscal receipt no., and the fiscal status
 * footer says so explicitly.
 */
function receiptRef(sale: SalePayload): string {
    const d = new Date(sale.occurred_at);
    const y = String(d.getFullYear()).slice(2);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const tail = sale.id.replace(/-/g, '').slice(-6).toUpperCase();
    return `REF-${y}${m}${day}-${tail}`;
}

/**
 * The receipt for a completed sale. Printing goes through the DeviceBridge, so
 * the same view works whether the host is a browser or a native shell.
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
 *
 * Fiscal status is shown honestly, not glossed over: a tenant with no
 * fiscal device configured sees "VAT Reg: Not Configured" (matching how a
 * real fiscal receipt would flag it), and EVERY receipt — even on a fully
 * configured, verified tenant — shows "Provisional" until fiscal submission
 * actually happens on sync. That's not a bug to hide; it's how the offline
 * architecture genuinely works, and hiding it would be the dishonest choice.
 */
export function Receipt({
                            sale,
                            device,
                            cashierName,
                            onDone,
                        }: {
    sale: SalePayload;
    device: DeviceSession;
    cashierName: string;
    onDone: () => void;
}) {
    const { tenant, branch } = device;
    const ref = receiptRef(sale);
    // Defensive: a till paired before this field existed has a session cached
    // in localStorage from the old /pos/session shape, with no tenant.fiscal
    // at all. It should self-heal once mergeSessionInfo() picks up a fresh
    // session on next successful sync — but until then (or if sync is
    // failing), this must not crash the receipt screen over a missing field
    // on a stale cache. Same class of bug as the earlier Business/Enterprise
    // pricing crash; this is the fix applied here too.
    const fiscal = tenant.fiscal ?? { verified: false, taxpayerTin: null, vatNumber: null };

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
                <div id="receipt" className="rounded-2xl bg-white p-6 shadow-lg font-mono">
                    {/* Business header */}
                    <div className="text-center">
                        <h1 className="font-sans text-base font-bold text-slate-900">{tenant.name}</h1>
                        <p className="text-xs text-slate-500">{branch.name}</p>
                        {branch.address && <p className="text-[11px] text-slate-400">{branch.address}</p>}
                        {branch.phone && <p className="text-[11px] text-slate-400">{branch.phone}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">
                            {fiscal.taxpayerTin ? `TIN: ${fiscal.taxpayerTin}` : 'TIN: —'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                            {fiscal.vatNumber ? `VAT Reg: ${fiscal.vatNumber}` : 'VAT Reg: Not Configured'}
                        </p>
                    </div>

                    <div className="my-3 border-t border-dashed border-slate-300" />

                    {/* Receipt meta */}
                    <div className="space-y-0.5 text-[11px] text-slate-500">
                        <div className="flex justify-between"><span>Ref</span><span className="text-slate-900">{ref}</span></div>
                        <div className="flex justify-between"><span>Date</span><span className="text-slate-900">{new Date(sale.occurred_at).toLocaleDateString()}</span></div>
                        <div className="flex justify-between"><span>Time</span><span className="text-slate-900">{new Date(sale.occurred_at).toLocaleTimeString()}</span></div>
                        <div className="flex justify-between"><span>Cashier</span><span className="text-slate-900">{cashierName}</span></div>
                    </div>

                    <div className="my-3 border-t border-dashed border-slate-300" />

                    {/* Line items */}
                    <ul className="space-y-1.5 text-sm">
                        {sale.lines.map((line) => (
                            <li key={line.id}>
                                <div className="flex justify-between text-slate-900">
                                    <span className="pr-2">{line.name}</span>
                                    <span className="tabular-nums shrink-0">{formatMoney(line.line_total_cents, sale.currency)}</span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                    {line.qty} × {formatMoney(line.unit_price_cents, sale.currency)}
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="my-3 border-t border-dashed border-slate-300" />

                    {/* Totals */}
                    <div className="space-y-0.5 text-sm text-slate-500">
                        <div className="flex justify-between">
                            <span>Net (ex VAT)</span>
                            <span className="tabular-nums">{formatMoney(sale.subtotal_cents, sale.currency)}</span>
                        </div>
                        {sale.tax_cents > 0 && (
                            <div className="flex justify-between">
                                <span>VAT (included)</span>
                                <span className="tabular-nums">{formatMoney(sale.tax_cents, sale.currency)}</span>
                            </div>
                        )}
                        {sale.gratuity_cents > 0 && (
                            <div className="flex justify-between">
                                <span>Gratuity</span>
                                <span className="tabular-nums">{formatMoney(sale.gratuity_cents, sale.currency)}</span>
                            </div>
                        )}
                    </div>
                    <div className="mt-1.5 flex justify-between border-t border-slate-900 pt-1.5 text-base font-bold text-slate-900">
                        <span>TOTAL</span>
                        <span className="tabular-nums">{formatMoney(sale.total_cents, sale.currency)}</span>
                    </div>

                    <div className="my-3 border-t border-dashed border-slate-300" />

                    {/* Payments */}
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment</p>
                    {sale.payments.map((p) => (
                        <div key={p.id}>
                            <div className="flex justify-between text-sm text-slate-700">
                                <span className="capitalize">{p.method}</span>
                                <span className="tabular-nums">{formatMoney(p.amount_cents, p.currency)}</span>
                            </div>
                            {p.received_cents != null && p.received_cents > p.amount_cents && (
                                <>
                                    <div className="flex justify-between text-[11px] text-slate-400">
                                        <span>Amount paid</span>
                                        <span className="tabular-nums">{formatMoney(p.received_cents, p.currency)}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px] text-slate-400">
                                        <span>Change</span>
                                        <span className="tabular-nums">{formatMoney(p.received_cents - p.amount_cents, p.currency)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}

                    {/* Tax breakdown — single row today (one tenant-wide VAT rate); see
              docblock in escpos.ts if this ever needs per-line tax codes. */}
                    {sale.tax_cents > 0 && (
                        <>
                            <div className="my-3 border-t border-dashed border-slate-300" />
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tax breakdown</p>
                            <div className="grid grid-cols-4 gap-1 text-[11px] text-slate-500">
                                <span>Code</span><span>Rate</span><span className="text-right">Taxable</span><span className="text-right">VAT</span>
                                <span className="text-slate-900">Standard</span>
                                <span className="text-slate-900">{(device.tenant.taxRateBps / 100).toFixed(0)}%</span>
                                <span className="text-right tabular-nums text-slate-900">{formatMoney(sale.subtotal_cents, sale.currency)}</span>
                                <span className="text-right tabular-nums text-slate-900">{formatMoney(sale.tax_cents, sale.currency)}</span>
                            </div>
                        </>
                    )}

                    <div className="my-3 border-t border-dashed border-slate-300" />

                    {/* Fiscal status — honest, not glossed over. Every fresh receipt is
              provisional regardless of configuration (fiscal submission
              happens on sync, not instantly); an unconfigured tenant gets a
              more specific nudge. */}
                    <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-center">
                        <p className="font-sans text-[11px] font-bold text-amber-700">
                            {fiscal.verified ? 'PROVISIONAL — PENDING FISCAL SYNC' : 'NOT YET FISCALISED'}
                        </p>
                        <p className="font-sans text-[10px] text-amber-600">
                            {fiscal.verified
                                ? 'Fiscal receipt number is assigned once this sale syncs.'
                                : 'Configure ZIMRA in Settings'}
                        </p>
                    </div>

                    <p className="mt-3 text-center text-[11px] text-slate-400">Thank you for your business</p>
                </div>

                <div className="mt-4 flex gap-3 print:hidden">
                    <button
                        onClick={() =>
                            void deviceBridge.printReceipt({
                                sale,
                                tenantName: tenant.name,
                                branchName: branch.name,
                                branchAddress: branch.address,
                                branchPhone: branch.phone,
                                cashierName,
                                receiptRef: ref,
                                fiscal,
                            })
                        }
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
