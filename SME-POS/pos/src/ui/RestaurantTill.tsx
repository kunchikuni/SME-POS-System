import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatMoney } from '../lib/money';
import {
    addProduct,
    cartTotals,
    emptyCart,
    removeLine,
    setQty,
    type Cart,
} from '../pos/cart';
import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';
import type {
    Category,
    Product,
    SalePayload,
    StockLevel,
    Table,
} from '../types/contract';
import { SyncBadge, SettingsChangedBanner, ModePill, ThemeToggle } from './Shared';
import { Checkout } from './Checkout';
import { Receipt } from './Receipt';
import { PrinterSettings } from './PrinterSettings';
import { TasksPanel } from './TasksPanel';
import { TasksButton } from './TasksButton';
import { ScannerModal } from './ScannerModal';
import { isScanSupported } from '../hardware/barcodeScanner';

type RestaurantView = 'floor' | 'catalog' | 'checkout' | 'receipt';

/**
 * Self-contained restaurant POS mode. Warm amber/orange accent, floor plan
 * as entry screen, table context carried through the catalog, separate
 * checkout for gratuity. Mode indicator pill lives in the header (read-only
 * — see Shared.tsx ModePill).
 */
export function RestaurantTill({
                                   device,
                                   shift,
                                   onEndShift,
                               }: {
    device: DeviceSession;
    shift: Shift;
    onEndShift: () => void;
}) {
    const products  = useLiveQuery(() => db.products.toArray(),      [], [] as Product[]);
    const categories= useLiveQuery(() => db.categories.toArray(),    [], [] as Category[]);
    const stockRows = useLiveQuery(() => db.stock.toArray(),          [], [] as StockLevel[]);
    const tables    = useLiveQuery(() => db.diningTables.toArray(),   [], [] as Table[]);
    const tenantRateBps = device.tenant.taxRateBps;

    const [cart,          setCart]          = useState<Cart>(emptyCart);
    const [view,          setView]          = useState<RestaurantView>('floor');
    const [table,         setTable]         = useState<Table | null>(null);
    const [lastSale,      setLastSale]      = useState<SalePayload | null>(null);
    const [search,        setSearch]        = useState('');
    const [categoryId,    setCategoryId]    = useState<string | null>(null);
    const [showPrinter,   setShowPrinter]   = useState(false);
    const [showTasks,     setShowTasks]     = useState(false);
    const [showCartSheet, setShowCartSheet] = useState(false);
    const [showScanner,   setShowScanner]   = useState(false);
    const [scanMiss,      setScanMiss]      = useState<string | null>(null);
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

    const totals    = cartTotals(cart, tenantRateBps);
    const itemCount = cart.lines.reduce((n, l) => n + l.qty, 0);

    const sections = useMemo(() => {
        const groups = new Map<string, Table[]>();
        for (const t of tables.filter((t) => t.is_active)) {
            const key = t.section ?? 'Floor';
            (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
        }
        return [...groups.entries()];
    }, [tables]);

    function handleScan(code: string) {
        setShowScanner(false);
        const trimmed = code.trim();
        const match = products.find(
            (p) => p.is_active && (p.barcode === trimmed || p.sku === trimmed),
        );
        if (match) { setScanMiss(null); setCart((c) => addProduct(c, match)); }
        else        { setScanMiss(trimmed); setSearch(trimmed); }
    }

    function newOrder() {
        setCart(emptyCart());
        setTable(null);
        setLastSale(null);
        setScanMiss(null);
        setShowCartSheet(false);
        setView('floor');
    }

    // ── Checkout screen ────────────────────────────────────────────────────
    if (view === 'checkout') {
        return (
            <Checkout
                cart={cart}
                cashierId={shift.cashierId}
                tableId={table?.id ?? null}
                showGratuity={true}
                tenantRateBps={tenantRateBps}
                onCancel={() => { setShowCartSheet(false); setView('catalog'); }}
                onComplete={(sale) => {
                    setLastSale(sale);
                    setCart(emptyCart());
                    setView('receipt');
                }}
            />
        );
    }

    // ── Receipt screen ─────────────────────────────────────────────────────
    if (view === 'receipt' && lastSale) {
        return (
            <Receipt
                sale={lastSale}
                tenantName={device.tenant.name}
                branchName={device.branch.name}
                onDone={newOrder}
            />
        );
    }

    // ── Floor plan ─────────────────────────────────────────────────────────
    if (view === 'floor') {
        return (
            <div className="min-h-dvh flex flex-col resto-floor-bg">
                <SettingsChangedBanner />
                <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 border-b border-white/6">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-orange-500/20 flex items-center justify-center text-xl ring-1 ring-orange-500/30">
                            🍽
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-white leading-tight">{device.tenant.name}</h1>
                            <p className="text-xs text-slate-500">{device.branch.name} · {shift.cashierName}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <SyncBadge />
                        <ThemeToggle />
                        <ModePill mode="restaurant" />
                        <TasksButton onClick={() => setShowTasks(true)} />
                        <button onClick={onEndShift} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400/80 hover:bg-red-500/10 hover:text-red-300 transition-colors">
                            End shift
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-5 py-6 dark-scroll">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">Floor Plan</h2>
                        <span className="text-xs text-slate-500">{tables.filter(t => t.is_active).length} tables</span>
                    </div>

                    {sections.length === 0 ? (
                        <div className="mt-24 flex flex-col items-center gap-4 text-center anim-fade-in">
                            <div className="h-16 w-16 rounded-2xl bg-white/4 flex items-center justify-center text-3xl ring-1 ring-white/8">🪑</div>
                            <div>
                                <p className="font-semibold text-slate-400">No tables yet</p>
                                <p className="mt-1 text-sm text-slate-600">Add tables in the dashboard — they'll appear here.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {sections.map(([section, sectionTables]) => (
                                <div key={section}>
                                    <div className="mb-3 flex items-center gap-3">
                                        <div className="h-px flex-1 bg-white/6" />
                                        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{section}</span>
                                        <div className="h-px flex-1 bg-white/6" />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                                        {sectionTables.map((t, i) => (
                                            <button
                                                key={t.id}
                                                onClick={() => { setTable(t); setCart(emptyCart()); setView('catalog'); }}
                                                className="group relative flex aspect-square flex-col items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/8 transition-all hover:bg-orange-500/10 hover:ring-orange-500/40 hover:shadow-[0_0_20px_rgba(234,88,12,0.2)] anim-pop-in"
                                                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                                            >
                                                {/* Subtle top accent on hover */}
                                                <div className="absolute inset-x-4 top-2 h-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <span className="text-lg font-bold text-white">{t.name}</span>
                                                {t.seats > 0 && (
                                                    <span className="mt-1 text-[10px] text-slate-500">{t.seats} seats</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Catalog + order ────────────────────────────────────────────────────
    const CartContent = () => (
        <div className="flex h-full flex-col dark-scroll">
            {/* Cart header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <div>
                    <h2 className="font-bold text-white tracking-tight">
                        {table ? `Table ${table.name}` : 'Order'}
                    </h2>
                    {itemCount > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">{itemCount} item{itemCount !== 1 ? 's' : ''}</p>
                    )}
                </div>
                {cart.lines.length > 0 && (
                    <button
                        onClick={() => setCart(emptyCart())}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >Clear</button>
                )}
            </div>

            {/* Line items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 dark-scroll">
                {cart.lines.length === 0 ? (
                    <div className="mt-10 flex flex-col items-center gap-3 text-center">
                        <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl ring-1 ring-white/8">🍴</div>
                        <p className="text-sm text-slate-500">Add items to the order</p>
                    </div>
                ) : (
                    cart.lines.map((line) => (
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
                                    onClick={() => setCart((c) => setQty(c, line.product.id, line.qty + 1))}
                                    className="h-6 w-6 rounded-md bg-white/8 text-slate-300 hover:bg-white/14 text-xs font-bold transition-colors flex items-center justify-center"
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
                    ))
                )}
            </div>

            {/* Totals + CTA */}
            <div className="border-t border-white/8 px-5 py-4 space-y-3">
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

                <button
                    onClick={() => { setShowCartSheet(false); setView('checkout'); }}
                    disabled={cart.lines.length === 0}
                    className="btn-resto w-full rounded-xl py-3.5 font-bold text-white text-sm tracking-wide flex items-center justify-center gap-2"
                >
                    <span>🔥</span>
                    <span>Send &amp; Settle · {formatMoney(totals.total_cents)}</span>
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-dvh flex-col resto-floor-bg">
            <SettingsChangedBanner />

            <div className="flex flex-1 flex-col lg:flex-row">
                {/* ── LEFT: Catalog ──────────────────────────────────────────── */}
                <section className="flex-1 flex flex-col min-h-0">
                    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 border-b border-white/6">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-orange-500/20 flex items-center justify-center text-xl ring-1 ring-orange-500/30">
                                🍽
                            </div>
                            <div>
                                <h1 className="text-base font-bold text-white leading-tight">{device.tenant.name}</h1>
                                <p className="text-xs text-slate-500">{device.branch.name} · {shift.cashierName}</p>
                            </div>
                            {table && (
                                <button
                                    onClick={() => setView('floor')}
                                    className="flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1 text-xs font-semibold text-orange-300 ring-1 ring-orange-500/30 hover:bg-orange-500/25 transition-colors"
                                >
                                    🪑 Table {table.name} · change
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <SyncBadge />
                            <ThemeToggle />
                            <ModePill mode="restaurant" />
                            <TasksButton onClick={() => setShowTasks(true)} />
                            <button onClick={() => setShowPrinter(true)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-colors">Printer</button>
                            <button onClick={() => setView('floor')}     className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-colors">Floor plan</button>
                            <button onClick={onEndShift}                 className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400/80 hover:bg-red-500/10 hover:text-red-300 transition-colors">End shift</button>
                        </div>
                    </header>

                    {showPrinter && <PrinterSettings onClose={() => setShowPrinter(false)} />}
                    {showTasks   && <TasksPanel cashierId={shift.cashierId} onClose={() => setShowTasks(false)} />}

                    {/* Search + scan */}
                    <div className="px-5 pt-4 pb-3 flex gap-2">
                        <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search menu…"
                                className="w-full rounded-xl border border-white/8 bg-white/5 pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all"
                            />
                        </div>
                        <button
                            onClick={() => isScanSupported() ? setShowScanner(true) : setScanUnsupported(true)}
                            className="flex shrink-0 items-center gap-2 rounded-xl border border-white/8 bg-white/5 px-4 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
                        >
                            <CameraIcon /> Scan
                        </button>
                    </div>

                    {scanUnsupported && (
                        <div className="mx-5 mb-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-2.5 text-xs text-amber-400 flex items-start justify-between gap-3">
                            <span>Camera scanning needs HTTPS in a Chrome-based browser.</span>
                            <button onClick={() => setScanUnsupported(false)} className="shrink-0 font-semibold underline">Dismiss</button>
                        </div>
                    )}
                    {scanMiss && (
                        <p className="mx-5 mb-3 text-xs text-amber-400">No item matches "{scanMiss}".</p>
                    )}
                    {showScanner && (
                        <ScannerModal onDetected={handleScan} onClose={() => setShowScanner(false)} />
                    )}

                    {/* Category pills */}
                    {products.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto px-5 pb-3 scrollbar-none">
                            <CategoryPill active={categoryId === null} onClick={() => setCategoryId(null)}>All</CategoryPill>
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
                                <div className="h-16 w-16 rounded-2xl bg-white/4 flex items-center justify-center text-3xl ring-1 ring-white/8">🍳</div>
                                <div>
                                    <p className="font-semibold text-slate-400">No menu items yet</p>
                                    <p className="mt-1 text-sm text-slate-600">Add items in the dashboard, then sync.</p>
                                </div>
                            </div>
                        ) : visible.length === 0 ? (
                            <p className="mt-16 text-center text-sm text-slate-600">No items match "{search}".</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                {visible.map((p, i) => {
                                    const qty = stock.get(p.id);
                                    const out = p.track_stock && qty !== undefined && qty <= 0;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => !out && setCart((c) => addProduct(c, p))}
                                            disabled={out}
                                            className="product-card product-card-resto flex flex-col rounded-2xl bg-white/5 p-3.5 text-left ring-1 ring-white/8 disabled:opacity-40 anim-pop-in"
                                            style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
                                        >
                                            <div className="mb-3 h-1 w-8 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 opacity-70" />
                                            <span className="line-clamp-2 min-h-9 text-sm font-semibold text-white leading-snug">
                        {p.name}
                      </span>
                                            <span className="mt-2 text-base font-bold text-orange-300 tabular-nums">
                        {formatMoney(p.price_cents, p.currency)}
                      </span>
                                            {p.track_stock && (
                                                <span className={`mt-1 text-[10px] font-medium ${out ? 'text-red-400' : 'text-slate-500'}`}>
                          {out ? 'Out of stock' : `${qty ?? 0} left`}
                        </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── RIGHT: Cart sidebar ────────────────────────────────────── */}
                <aside className="sidebar-resto hidden border-l border-white/6 lg:flex lg:w-96 lg:flex-col">
                    <CartContent />
                </aside>

                {/* Mobile floating pill */}
                {itemCount > 0 && !showCartSheet && (
                    <button
                        onClick={() => setShowCartSheet(true)}
                        className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-white shadow-xl lg:hidden btn-resto"
                    >
                        <span className="text-sm font-bold">🍴 {itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                        <span className="font-semibold text-sm">· {formatMoney(totals.total_cents)}</span>
                    </button>
                )}

                {/* Mobile cart sheet */}
                {showCartSheet && (
                    <div
                        className="fixed inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm lg:hidden anim-fade-in"
                        onClick={() => setShowCartSheet(false)}
                    >
                        <div
                            className="sidebar-resto max-h-[88vh] w-full rounded-t-3xl ring-1 ring-white/10 anim-slide-up"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-center pt-3 pb-1">
                                <div className="h-1 w-10 rounded-full bg-white/15" />
                            </div>
                            <div className="max-h-[calc(88vh-24px)] overflow-y-auto dark-scroll">
                                <CartContent />
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
                    ? 'bg-orange-600 text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]'
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
