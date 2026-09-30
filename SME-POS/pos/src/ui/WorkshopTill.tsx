import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatMoney, toCents } from '../lib/money';
import {
    addProduct,
    atStockLimit,
    availableFor,
    cartTotals,
    emptyCart,
    qtyInCart,
    removeLine,
    setQty,
    stockLimitMessage,
    type Cart,
} from '../pos/cart';
import { completeSale, saleErrorMessage } from '../pos/checkout';
import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';
import type { Category, PaymentMethod, Product, SalePayload, StockLevel } from '../types/contract';
import { SyncBadge, SettingsChangedBanner, ModePill, ThemeToggle, OutboxStuckBanner, SyncedToast, InstallAppButton, TillHeaderButtons } from './Shared';
import { Receipt } from './Receipt';
import { PrinterSettings } from './PrinterSettings';
import { TasksPanel } from './TasksPanel';
import { CreditCustomerFields, useCreditCustomer } from './CreditCustomer';
import { ReceiveStock } from './ReceiveStock';
import { RecordPayment } from './RecordPayment';

const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: 'cash',     label: 'Cash',    icon: '💵' },
    { value: 'ecocash',  label: 'EcoCash', icon: '📱' },
    { value: 'zipit',    label: 'ZIPIT',   icon: '⚡' },
    { value: 'other',    label: 'Other',   icon: '🔄' },
    { value: 'credit',   label: 'Credit',  icon: '📒' },
];

/**
 * Workshop / service POS mode — for repair shops, garages, and service
 * businesses. Labour charges and service items can be set up as products
 * in the catalogue (e.g. "Labour - 1hr", "Oil Change").
 *
 * Extra fields over RetailTill:
 *   - Customer name (for the job card / receipt)
 *   - Job / work order reference
 *   - Asset / vehicle description
 *
 * Future work: a dedicated job-card entity with status tracking
 * (received, in progress, ready for collection) is not yet implemented.
 */
export function WorkshopTill({
                                 device,
                                 shift,
                                 onEndShift,
                             }: {
    device: DeviceSession;
    shift: Shift;
    onEndShift: () => void;
}) {
    const tenantRateBps = device.tenant.taxRateBps;

    const products   = useLiveQuery(() => db.products.toArray(),   [], [] as Product[]);
    const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
    const stockRows  = useLiveQuery(() => db.stock.toArray(),       [], [] as StockLevel[]);

    const [cart,         setCart]         = useState<Cart>(emptyCart);
    const [lastSale,     setLastSale]     = useState<SalePayload | null>(null);
    const [search,       setSearch]       = useState('');
    const [categoryId,   setCategoryId]   = useState<string | null>(null);
    const [method,       setMethod]       = useState<PaymentMethod>('cash');
    const [received,     setReceived]     = useState('');
    const [customerName, setCustomerName] = useState('');
    const [jobRef,       setJobRef]       = useState('');
    const [assetDesc,    setAssetDesc]    = useState('');
    const [completing,   setCompleting]   = useState(false);
    const [saleError,    setSaleError]    = useState<string | null>(null);
    const [showPrinter,  setShowPrinter]  = useState(false);
    const [showTasks,    setShowTasks]    = useState(false);
    const [showReceiveStock,  setShowReceiveStock]  = useState(false);
    const [showRecordPayment, setShowRecordPayment] = useState(false);
    const credit = useCreditCustomer();
    const isManager = shift.role === 'owner' || shift.role === 'manager';

    /** Choosing Credit pre-fills the debtor from the job card's customer, if one was typed. */
    function chooseMethod(m: PaymentMethod) {
        setMethod(m);
        if (m === 'credit' && !credit.name.trim() && customerName.trim()) credit.setName(customerName.trim());
    }

    const stock = useMemo(() => {
        const map = new Map<string, number>();
        for (const row of stockRows) map.set(row.product_id, row.quantity);
        return map;
    }, [stockRows]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return products
            .filter((p) => p.is_active)
            .filter((p) => (categoryId ? p.category_id === categoryId : true))
            .filter((p) =>
                q === '' ? true :
                    p.name.toLowerCase().includes(q) ||
                    (p.sku ?? '').toLowerCase().includes(q),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [products, search, categoryId]);

    const totals = cartTotals(cart, tenantRateBps);
    const receivedCents = toCents(received);
    const change = method === 'cash' && receivedCents > 0 ? receivedCents - totals.total_cents : null;
    const itemCount = cart.lines.reduce((n, l) => n + l.qty, 0);

    async function completeSaleNow() {
        setCompleting(true);
        setSaleError(null);
        try {
            const sale = await completeSale(cart, {
                cashierId: shift.cashierId,
                payments: [{
                    method,
                    amount_cents: totals.total_cents,
                    received_cents: method === 'cash' && receivedCents > 0 ? receivedCents : null,
                }],
                customer: method === 'credit' ? credit.toSaleCustomer() : null,
                tenantRateBps,
            });
            setLastSale(sale);
            setCart(emptyCart);
            setCustomerName('');
            setJobRef('');
            setAssetDesc('');
            setMethod('cash');
            setReceived('');
            credit.reset();
        } catch (err) {
            setSaleError(saleErrorMessage(err));
        } finally {
            setCompleting(false);
        }
    }

    /** Tap: adds one, unless the cart already holds everything on hand. */
    function tryAdd(p: Product) {
        const available = availableFor(p, stock);
        if (available !== undefined && qtyInCart(cart, p.id) >= available) {
            setSaleError(stockLimitMessage(p, available));
            return;
        }
        setSaleError(null);
        setCart((c) => addProduct(c, p, available));
    }

    function newOrder() {
        setLastSale(null);
        setCart(emptyCart);
        setMethod('cash');
        setReceived('');
        credit.reset();
        setSaleError(null);
    }

    if (lastSale) {
        return <Receipt sale={lastSale} device={device} cashierName={shift.cashierName} onDone={newOrder} />;
    }

    return (
        <div className="flex h-screen flex-col pos-bg text-white overflow-hidden">
            <header className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
                <div className="flex items-center gap-3">
                    <SyncBadge />
                    <ModePill mode={device.branch.mode} kind={device.branch.kind} />
                </div>
                <span className="text-sm font-semibold text-slate-300">{device.branch.name}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                    <InstallAppButton />
                    <ThemeToggle />
                    <TillHeaderButtons
                        isManager={isManager}
                        onTasks={() => setShowTasks(true)}
                        onReceiveStock={() => setShowReceiveStock(true)}
                        onRecordPayment={() => setShowRecordPayment(true)}
                        onPrinter={() => setShowPrinter(true)}
                        onEndShift={onEndShift}
                    />
                </div>
            </header>

            {showTasks   && <TasksPanel cashierId={shift.cashierId} onClose={() => setShowTasks(false)} />}
            {showPrinter && <PrinterSettings onClose={() => setShowPrinter(false)} />}
            {showReceiveStock && (
                <ReceiveStock branchId={device.branch.id} products={products} stockRows={stockRows} onClose={() => setShowReceiveStock(false)} />
            )}
            {showRecordPayment && (
                <RecordPayment customers={credit.customers} onClose={() => setShowRecordPayment(false)} />
            )}
            <OutboxStuckBanner />
            <SyncedToast />
            <SettingsChangedBanner />

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT: service/product grid */}
                <section className="flex flex-col flex-1 border-r border-white/8 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/8 space-y-2">
                        <input
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50"
                            placeholder="Search services, parts…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            <button className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${!categoryId ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`} onClick={() => setCategoryId(null)}>All</button>
                            {categories.map((c: Category) => (
                                <button key={c.id} className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${categoryId === c.id ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`} onClick={() => setCategoryId(c.id)}>{c.name}</button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
                        {visible.map((p: Product) => {
                            // availableFor: negative levels count as 0 (was `=== 0`, so a
                            // level driven negative by offline sales looked sellable).
                            const available = availableFor(p, stock);
                            const qty = available ?? 0;
                            const oos = available === 0;
                            return (
                                <button key={p.id} className={`rounded-2xl border p-3 text-left transition-all ${oos ? 'border-white/5 bg-white/3 opacity-40 cursor-not-allowed' : 'border-white/8 bg-white/5 hover:bg-white/10 active:scale-[0.98]'}`} onClick={() => tryAdd(p)} disabled={oos}>
                                    <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{p.name}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{p.sku ?? ''}</p>
                                    <p className="mt-1.5 text-base font-bold text-violet-300 tabular-nums">{formatMoney(p.price_cents, p.currency)}</p>
                                    {p.track_stock && <p className={`text-[10px] mt-1 ${qty < 3 ? 'text-amber-400' : 'text-slate-500'}`}>{oos ? 'Out of stock' : `${qty} in stock`}</p>}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* RIGHT: job card + cart */}
                <section className="sidebar-retail flex h-full w-80 xl:w-96 shrink-0 flex-col border-l border-white/6">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                        <div>
                            <h2 className="font-bold text-white tracking-tight">Job Card</h2>
                            {itemCount > 0 && <p className="text-xs text-slate-400 mt-0.5">{itemCount} item{itemCount !== 1 ? 's' : ''}</p>}
                        </div>
                        {cart.lines.length > 0 && <button onClick={() => setCart(emptyCart)} className="text-xs text-slate-500 hover:text-red-400 transition-colors">Clear</button>}
                    </div>

                    {/* Workshop-specific fields */}
                    <div className="px-5 pt-3 pb-2 border-b border-white/8 space-y-2">
                        <div>
                            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Customer name</label>
                            <input className="mt-1 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50" placeholder="e.g. Tariro Moyo" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Job ref</label>
                                <input className="mt-1 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50" placeholder="WS-001" value={jobRef} onChange={(e) => setJobRef(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Asset / vehicle</label>
                                <input className="mt-1 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50" placeholder="ABC 1234" value={assetDesc} onChange={(e) => setAssetDesc(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                        {cart.lines.length === 0 ? (
                            <div className="mt-10 flex flex-col items-center gap-3 text-center">
                                <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl ring-1 ring-white/8">🔩</div>
                                <p className="text-sm text-slate-500">Add services or parts above</p>
                            </div>
                        ) : (
                            cart.lines.map((line) => (
                                <div key={line.product.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/6">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">{line.product.name}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">{formatMoney(line.product.price_cents, line.product.currency)} ea.</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button onClick={() => setCart((c) => setQty(c, line.product.id, line.qty - 1))} className="h-6 w-6 rounded-md bg-white/8 text-slate-300 text-xs font-bold flex items-center justify-center">−</button>
                                        <span className="w-5 text-center text-sm font-semibold text-white tabular-nums">{line.qty}</span>
                                        <button onClick={() => setCart((c) => setQty(c, line.product.id, line.qty + 1, availableFor(line.product, stock)))} disabled={atStockLimit(line, stock)} className="h-6 w-6 rounded-md bg-white/8 text-slate-300 text-xs font-bold flex items-center justify-center disabled:opacity-30">+</button>
                                    </div>
                                    <div className="w-16 text-right text-sm font-semibold text-white tabular-nums shrink-0">{formatMoney(line.product.price_cents * line.qty, line.product.currency)}</div>
                                    <button onClick={() => setCart((c) => removeLine(c, line.product.id))} className="text-slate-600 hover:text-red-400 transition-colors text-xs">✕</button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="border-t border-white/8 px-5 py-4 space-y-4">
                        <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Payment</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {METHODS.map((m) => (
                                    <button key={m.value} onClick={() => chooseMethod(m.value)} className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${method === m.value ? 'border-violet-500/60 bg-violet-500/20 text-violet-200' : 'border-white/8 text-slate-400 hover:border-white/16 hover:bg-white/5'}`}>
                                        <span>{m.icon}</span><span>{m.label}</span>
                                    </button>
                                ))}
                            </div>
                            {method === 'cash' && (
                                <div className="mt-2.5">
                                    <input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="Cash received (optional)" className="w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm tabular-nums text-white placeholder-slate-600 outline-none" />
                                    {change !== null && change >= 0 && <p className="mt-1.5 text-xs text-slate-400">Change: <span className="font-semibold text-white">{formatMoney(change)}</span></p>}
                                </div>
                            )}
                            {method === 'credit' && <CreditCustomerFields credit={credit} />}
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-500"><span>Net (ex VAT)</span><span className="tabular-nums">{formatMoney(totals.subtotal_cents)}</span></div>
                            {totals.tax_cents > 0 && <div className="flex justify-between text-xs text-slate-500"><span>VAT {tenantRateBps / 100}%</span><span className="tabular-nums">{formatMoney(totals.tax_cents)}</span></div>}
                            <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-white/8"><span>Total</span><span className="tabular-nums">{formatMoney(totals.total_cents)}</span></div>
                        </div>
                        {saleError && <p className="text-xs text-red-400">{saleError}</p>}
                        <button onClick={completeSaleNow} disabled={cart.lines.length === 0 || completing} className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 font-bold text-white text-sm tracking-wide shadow-lg shadow-indigo-500/25 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                            {completing ? 'Processing…' : `Charge ${formatMoney(totals.total_cents)}`}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
