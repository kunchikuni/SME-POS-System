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
import type {
    Category,
    PaymentMethod,
    Product,
    SalePayload,
    StockLevel,
} from '../types/contract';
import { SyncBadge, SettingsChangedBanner, ModePill, ThemeToggle, UpdateAvailableBanner, OutboxStuckBanner, SyncedToast, InstallAppButton } from './Shared';
import { Receipt } from './Receipt';
import { PrinterSettings } from './PrinterSettings';
import { TasksPanel } from './TasksPanel';
import { ReceiveStock } from './ReceiveStock';
import { CreditCustomerFields, useCreditCustomer } from './CreditCustomer';
import { RecordPayment } from './RecordPayment';
import { ScannerModal } from './ScannerModal';
import { isScanSupported } from '../hardware/barcodeScanner';

const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: 'cash',     label: 'Cash',     icon: '💵' },
    { value: 'ecocash',  label: 'EcoCash',  icon: '📱' },
    { value: 'innbucks', label: 'InnBucks', icon: '🏦' },
    { value: 'omari',    label: 'Omari',    icon: '💳' },
    { value: 'onemoney', label: 'OneMoney', icon: '📲' },
    { value: 'zipit',    label: 'ZIPIT',    icon: '⚡' },
    { value: 'credit',   label: 'Credit',   icon: '📒' },
];

/**
 * Self-contained retail POS mode. Violet/indigo accent palette, dark glass
 * sidebar, inline checkout — no separate checkout screen needed for retail.
 */
export function RetailTill({
                               device,
                               shift,
                               onEndShift,
                           }: {
    device: DeviceSession;
    shift: Shift;
    onEndShift: () => void;
}) {
    const products  = useLiveQuery(() => db.products.toArray(),   [], [] as Product[]);
    const categories= useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
    const stockRows = useLiveQuery(() => db.stock.toArray(),       [], [] as StockLevel[]);
    const credit = useCreditCustomer();
    const customers = credit.customers;
    const tenantRateBps = device.tenant.taxRateBps;

    const [cart,           setCart]           = useState<Cart>(emptyCart);
    const [lastSale,       setLastSale]       = useState<SalePayload | null>(null);
    const [search,         setSearch]         = useState('');
    const [categoryId,     setCategoryId]     = useState<string | null>(null);
    const [method,         setMethod]         = useState<PaymentMethod>('cash');
    const [received,       setReceived]       = useState('');
    const [completing,     setCompleting]     = useState(false);
    const [saleError,      setSaleError]      = useState<string | null>(null);
    const [showPrinter,    setShowPrinter]    = useState(false);
    const [showTasks,      setShowTasks]      = useState(false);
    const [showReceiveStock, setShowReceiveStock] = useState(false);
    const [showRecordPayment, setShowRecordPayment] = useState(false);
    const [showCartSheet,  setShowCartSheet]  = useState(false);
    const [showScanner,    setShowScanner]    = useState(false);
    const [scanMiss,       setScanMiss]       = useState<string | null>(null);
    const [scanUnsupported,setScanUnsupported]= useState(false);

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
                q === '' ? true : p.name.toLowerCase().includes(q) ||
                    (p.sku ?? '').toLowerCase().includes(q) ||
                    (p.barcode ?? '').toLowerCase().includes(q),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [products, search, categoryId]);

    const totals = cartTotals(cart, tenantRateBps);
    const receivedCents = toCents(received);
    const change = method === 'cash' && receivedCents > 0 ? receivedCents - totals.total_cents : null;
    const itemCount = cart.lines.reduce((n, l) => n + l.qty, 0);

    /** Tap or scan: adds one, unless the cart already holds everything on hand. */
    function tryAdd(p: Product) {
        const available = availableFor(p, stock);
        if (available !== undefined && qtyInCart(cart, p.id) >= available) {
            setSaleError(stockLimitMessage(p, available));
            return;
        }
        setSaleError(null);
        setCart((c) => addProduct(c, p, available));
    }

    function handleScan(code: string) {
        setShowScanner(false);
        const trimmed = code.trim();
        const match = products.find(
            (p) => p.is_active && (p.barcode === trimmed || p.sku === trimmed),
        );
        if (match) { setScanMiss(null); tryAdd(match); }
        else        { setScanMiss(trimmed); setSearch(trimmed); }
    }

    async function completeSaleNow() {
        if (method === 'credit' && !credit.name.trim()) {
            setSaleError('Enter the customer\u2019s name for a credit sale.');
            return;
        }
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
            setCart(emptyCart());
            setMethod('cash');
            setReceived('');
            credit.reset();
            setShowCartSheet(false);
        } catch (err) {
            setSaleError(saleErrorMessage(err));
        } finally {
            setCompleting(false);
        }
    }

    function newOrder() {
        setLastSale(null);
        setCart(emptyCart());
        setMethod('cash');
        setReceived('');
        credit.reset();
        setSaleError(null);
    }

    if (lastSale) {
        return (
            <Receipt
                sale={lastSale}
                device={device}
                cashierName={shift.cashierName}
                onDone={newOrder}
            />
        );
    }

    // Called as {renderCart()}, never mounted as {renderCart()}. As a component
    // declared inside RetailTill it was a NEW component type on every render,
    // so each keystroke (state change → re-render) unmounted and remounted the
    // whole cart panel — the credit customer's name box and the cash-received
    // box lost focus after every letter. A plain function call keeps the same
    // elements in place between renders.
    const renderCart = () => (
        <div className="flex h-full flex-col dark-scroll">
            {/* Cart header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <div>
                    <h2 className="font-bold text-white tracking-tight">Order</h2>
                    {itemCount > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">{itemCount} item{itemCount !== 1 ? 's' : ''}</p>
                    )}
                </div>
                {cart.lines.length > 0 && (
                    <button
                        onClick={() => setCart(emptyCart())}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Line items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 dark-scroll">
                {cart.lines.length === 0 ? (
                    <div className="mt-10 flex flex-col items-center gap-3 text-center">
                        <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl ring-1 ring-white/8">
                            🛒
                        </div>
                        <p className="text-sm text-slate-500">Tap a product to start</p>
                    </div>
                ) : (
                    cart.lines.map((line) => {
                        const available = availableFor(line.product, stock);
                        const atLimit = atStockLimit(line, stock);
                        return (
                        <div
                            key={line.product.id}
                            className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/6 anim-slide-up"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">{line.product.name}</div>
                                <div className="text-xs text-slate-400 mt-0.5">
                                    {formatMoney(line.product.price_cents, line.product.currency)} ea.
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={() => setCart((c) => setQty(c, line.product.id, line.qty - 1))}
                                    className="h-6 w-6 rounded-md bg-white/8 text-slate-300 hover:bg-white/14 text-xs font-bold transition-colors flex items-center justify-center"
                                >−</button>
                                <span className="w-5 text-center text-sm font-semibold text-white tabular-nums">{line.qty}</span>
                                <button
                                    onClick={() => setCart((c) => setQty(c, line.product.id, line.qty + 1, available))}
                                    disabled={atLimit}
                                    title={atLimit ? stockLimitMessage(line.product, available ?? 0) : undefined}
                                    className="h-6 w-6 rounded-md bg-white/8 text-slate-300 hover:bg-white/14 text-xs font-bold transition-colors flex items-center justify-center disabled:opacity-30 disabled:hover:bg-white/8"
                                >+</button>
                            </div>
                            <div className="w-16 text-right text-sm font-semibold text-white tabular-nums shrink-0">
                                {formatMoney(line.product.price_cents * line.qty, line.product.currency)}
                            </div>
                            <button
                                onClick={() => setCart((c) => removeLine(c, line.product.id))}
                                className="text-slate-600 hover:text-red-400 transition-colors shrink-0 text-xs"
                                aria-label={`Remove ${line.product.name}`}
                            >✕</button>
                        </div>
                        );
                    })
                )}
            </div>

            {/* Payment + totals */}
            <div className="border-t border-white/8 px-5 py-4 space-y-4">
                {/* Payment method */}
                <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        Payment
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                        {METHODS.map((m) => (
                            <button
                                key={m.value}
                                onClick={() => setMethod(m.value)}
                                className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs font-medium transition-all ${
                                    method === m.value
                                        ? 'border-violet-500/60 bg-violet-500/20 text-violet-200 shadow-[0_0_10px_rgba(139,92,246,0.25)]'
                                        : 'border-white/8 text-slate-400 hover:border-white/16 hover:bg-white/5'
                                }`}
                            >
                                <span className="text-base">{m.icon}</span>
                                <span>{m.label}</span>
                            </button>
                        ))}
                    </div>

                    {method === 'cash' && (
                        <div className="mt-2.5">
                            <input
                                inputMode="decimal"
                                value={received}
                                onChange={(e) => setReceived(e.target.value)}
                                placeholder="Cash received (optional)"
                                className="w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm tabular-nums text-white placeholder-slate-600 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                            {change !== null && change >= 0 && (
                                <p className="mt-1.5 text-xs text-slate-400">
                                    Change: <span className="font-semibold text-white">{formatMoney(change)}</span>
                                </p>
                            )}
                        </div>
                    )}

                    {method === 'credit' && <CreditCustomerFields credit={credit} />}
                </div>

                {/* Totals */}
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                        <span>Net (ex VAT)</span>
                        <span className="tabular-nums">{formatMoney(totals.subtotal_cents)}</span>
                    </div>
                    {totals.tax_cents > 0 && (
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>VAT {tenantRateBps / 100}% (incl.)</span>
                            <span className="tabular-nums">{formatMoney(totals.tax_cents)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-white/8">
                        <span>Total</span>
                        <span className="tabular-nums">{formatMoney(totals.total_cents)}</span>
                    </div>
                </div>

                {saleError && <p className="text-xs text-red-400">{saleError}</p>}

                <button
                    onClick={completeSaleNow}
                    disabled={cart.lines.length === 0 || completing}
                    className="btn-retail w-full rounded-xl py-3.5 font-bold text-white text-sm tracking-wide"
                >
                    {completing
                        ? 'Saving…'
                        : `Complete Sale · ${formatMoney(totals.total_cents)}`}
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-dvh flex-col pos-bg">
            <UpdateAvailableBanner />
            <OutboxStuckBanner />
            <SyncedToast />
            <SettingsChangedBanner />

            <div className="flex flex-1 flex-col lg:flex-row">
                {/* ── LEFT: Catalog ──────────────────────────────────────────── */}
                <section className="flex-1 flex flex-col min-h-0">
                    {/* Header */}
                    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 border-b border-white/6">
                        <div className="flex flex-wrap items-center gap-3">
                            <div>
                                <h1 className="text-base font-bold text-white leading-tight">{device.tenant.name}</h1>
                                <p className="text-xs text-slate-500 mt-0.5">{device.branch.name} · {shift.cashierName}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <SyncBadge />
                            <ThemeToggle />
                            <InstallAppButton />
                            <ModePill mode="retail" />
                            <button
                                onClick={() => setShowTasks(true)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-colors"
                            >Tasks</button>
                            {(shift.role === 'owner' || shift.role === 'manager') && (
                                <button
                                    onClick={() => setShowReceiveStock(true)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-colors"
                                >Receive stock</button>
                            )}
                            {(shift.role === 'owner' || shift.role === 'manager') && (
                                <button
                                    onClick={() => setShowRecordPayment(true)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-colors"
                                >Record payment</button>
                            )}
                            <button
                                onClick={() => setShowPrinter(true)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-colors"
                            >Printer</button>
                            <button
                                onClick={onEndShift}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400/80 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                            >End shift</button>
                        </div>
                    </header>

                    {showPrinter && <PrinterSettings onClose={() => setShowPrinter(false)} />}
                    {showTasks   && <TasksPanel cashierId={shift.cashierId} onClose={() => setShowTasks(false)} />}
                    {showReceiveStock && (
                        <ReceiveStock
                            branchId={device.branch.id}
                            products={products}
                            stockRows={stockRows}
                            onClose={() => setShowReceiveStock(false)}
                        />
                    )}
                    {showRecordPayment && (
                        <RecordPayment
                            customers={customers}
                            onClose={() => setShowRecordPayment(false)}
                        />
                    )}

                    {/* Search + scan */}
                    <div className="px-5 pt-4 pb-3 flex gap-2">
                        <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name, SKU or barcode…"
                                className="w-full rounded-xl border border-white/8 bg-white/5 pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                        </div>
                        <button
                            onClick={() => isScanSupported() ? setShowScanner(true) : setScanUnsupported(true)}
                            className="flex shrink-0 items-center gap-2 rounded-xl border border-white/8 bg-white/5 px-4 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
                        >
                            <CameraIcon /> Scan
                        </button>
                    </div>

                    {/* Notifications */}
                    {scanUnsupported && (
                        <div className="mx-5 mb-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-2.5 text-xs text-amber-400 flex items-start justify-between gap-3">
                            <span>Camera scanning needs HTTPS in a Chrome-based browser. A USB/Bluetooth scanner works now — it types into the search box.</span>
                            <button onClick={() => setScanUnsupported(false)} className="shrink-0 font-semibold underline">Dismiss</button>
                        </div>
                    )}
                    {scanMiss && (
                        <p className="mx-5 mb-3 text-xs text-amber-400">
                            No product matches "{scanMiss}". Search by name, or add it in the dashboard.
                        </p>
                    )}
                    {showScanner && (
                        <ScannerModal onDetected={handleScan} onClose={() => setShowScanner(false)} />
                    )}

                    {/* Category pills */}
                    {products.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto px-5 pb-3 scrollbar-none">
                            <CategoryPill active={categoryId === null} onClick={() => setCategoryId(null)}>
                                All
                            </CategoryPill>
                            {categories.map((c) => (
                                <CategoryPill key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                                    {c.name}
                                </CategoryPill>
                            ))}
                        </div>
                    )}

                    {/* Product grid */}
                    <div className="flex-1 overflow-y-auto px-5 pb-24 lg:pb-5 dark-scroll">
                        {products.length === 0 ? (
                            <div className="mt-24 flex flex-col items-center gap-4 text-center anim-fade-in">
                                <div className="h-16 w-16 rounded-2xl bg-white/4 flex items-center justify-center text-3xl ring-1 ring-white/8">📦</div>
                                <div>
                                    <p className="font-semibold text-slate-400">No products yet</p>
                                    <p className="mt-1 text-sm text-slate-600">Add products in the dashboard, then sync.</p>
                                </div>
                            </div>
                        ) : visible.length === 0 ? (
                            <p className="mt-16 text-center text-sm text-slate-600">No products match "{search}".</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                {visible.map((p, i) => {
                                    const available = availableFor(p, stock);
                                    const out = available === 0;
                                    const left = available === undefined ? undefined : available - qtyInCart(cart, p.id);
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => tryAdd(p)}
                                            disabled={out}
                                            className="product-card product-card-retail flex flex-col rounded-2xl bg-white/5 p-3.5 text-left ring-1 ring-white/8 disabled:opacity-40 anim-pop-in"
                                            style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
                                        >
                                            {/* Colour accent bar */}
                                            <div className="mb-3 h-1 w-8 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 opacity-70" />
                                            <span className="line-clamp-2 min-h-9 text-sm font-semibold text-white leading-snug">
                        {p.name}
                      </span>
                                            <span className="mt-2 text-base font-bold text-violet-300 tabular-nums">
                        {formatMoney(p.price_cents, p.currency)}
                      </span>
                                            {p.track_stock && (
                                                <span className={`mt-1 text-[10px] font-medium ${out ? 'text-red-400' : 'text-slate-500'}`}>
                          {out ? 'Out of stock' : left === 0 ? `All ${available} in cart` : `${available} in stock`}
                        </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── RIGHT: Cart — desktop sidebar ──────────────────────────── */}
                <aside className="sidebar-retail hidden border-l border-white/6 lg:flex lg:w-96 lg:flex-col">
                    {renderCart()}
                </aside>

                {/* ── Mobile floating pill ──────────────────────────────────── */}
                {itemCount > 0 && !showCartSheet && (
                    <button
                        onClick={() => setShowCartSheet(true)}
                        className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-white shadow-xl lg:hidden btn-retail"
                    >
                        <span className="text-sm font-bold">🛒 {itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                        <span className="font-semibold text-sm">· {formatMoney(totals.total_cents)}</span>
                    </button>
                )}

                {/* ── Mobile cart sheet ──────────────────────────────────────── */}
                {showCartSheet && (
                    <div
                        className="fixed inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm lg:hidden anim-fade-in"
                        onClick={() => setShowCartSheet(false)}
                    >
                        <div
                            className="sidebar-retail max-h-[88vh] w-full rounded-t-3xl ring-1 ring-white/10 anim-slide-up"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-center pt-3 pb-1">
                                <div className="h-1 w-10 rounded-full bg-white/15" />
                            </div>
                            <div className="max-h-[calc(88vh-24px)] overflow-y-auto dark-scroll">
                                {renderCart()}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function CategoryPill({
                          active,
                          onClick,
                          children,
                      }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                active
                    ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.4)]'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 ring-1 ring-white/8'
            }`}
        >
            {children}
        </button>
    );
}

function CameraIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
            <circle cx="12" cy="14" r="3.5" />
        </svg>
    );
}
