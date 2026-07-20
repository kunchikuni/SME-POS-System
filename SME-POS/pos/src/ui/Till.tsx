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
import { completeSale } from '../pos/checkout';
import { isRestaurant } from '../pos/mode';
import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';
import type {
  Category,
  PaymentMethod,
  Product,
  SalePayload,
  StockLevel,
  Table,
} from '../types/contract';
import { SyncBadge } from './Shared';
import { Checkout } from './Checkout';
import { Receipt } from './Receipt';
import { PrinterSettings } from './PrinterSettings';
import { FloorPlan } from './FloorPlan';
import { ScannerModal } from './ScannerModal';
import { TasksPanel } from './TasksPanel';
import { isScanSupported } from '../hardware/barcodeScanner';

type View = 'floor' | 'catalog' | 'checkout' | 'receipt';

// The Zimbabwean tender rails, in the order the reference till shows them.
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'ecocash', label: 'EcoCash' },
  { value: 'innbucks', label: 'InnBucks' },
  { value: 'omari', label: 'Omari' },
  { value: 'onemoney', label: 'OneMoney' },
  { value: 'zipit', label: 'ZIPIT' },
];

export function Till({
  device,
  shift,
  onEndShift,
}: {
  device: DeviceSession;
  shift: Shift;
  onEndShift: () => void;
}) {
  const restaurant = isRestaurant();
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const stockRows = useLiveQuery(() => db.stock.toArray(), [], [] as StockLevel[]);
  const tables = useLiveQuery(() => db.diningTables.toArray(), [], [] as Table[]);
  const tenantRateBps = device.tenant.taxRateBps;

  const [cart, setCart] = useState<Cart>(emptyCart);
  const [view, setView] = useState<View>(restaurant ? 'floor' : 'catalog');
  const [table, setTable] = useState<Table | null>(null);
  const [lastSale, setLastSale] = useState<SalePayload | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showPrinter, setShowPrinter] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const [scanUnsupported, setScanUnsupported] = useState(false);

  // Retail checkout is single-screen: pick a method, tap Complete Sale, done.
  // Restaurant keeps the separate Checkout screen (below) because gratuity
  // needs more room than this panel has, and none of the reference layouts
  // show a table/tip flow to match against.
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [completing, setCompleting] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

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
        q === ''
          ? true
          : p.name.toLowerCase().includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q) ||
            (p.barcode ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, categoryId]);

  const totals = cartTotals(cart, tenantRateBps);

  /**
   * A scanned code rings the item straight into the cart — that's the whole
   * point of scanning. Matching is exact on barcode, then SKU. An unknown code
   * is not an error: it drops into the search box so the cashier can find the
   * item by name, and we say which code missed.
   */
  function handleScan(code: string) {
    setShowScanner(false);
    const trimmed = code.trim();
    const match = products.find(
      (p) => p.is_active && (p.barcode === trimmed || p.sku === trimmed),
    );

    if (match) {
      setScanMiss(null);
      setCart((c) => addProduct(c, match));
    } else {
      setScanMiss(trimmed);
      setSearch(trimmed);
    }
  }

  function newOrder() {
    setCart(emptyCart());
    setTable(null);
    setMethod('cash');
    setSaleError(null);
    setView(restaurant ? 'floor' : 'catalog');
  }

  /** Retail's single-screen checkout: no separate view, no gratuity step. */
  async function completeRetailSale() {
    setCompleting(true);
    setSaleError(null);
    try {
      const sale = await completeSale(cart, {
        cashierId: shift.cashierId,
        payments: [{ method, amount_cents: totals.total_cents }],
        tenantRateBps,
      });
      setLastSale(sale);
      setCart(emptyCart());
      setMethod('cash');
      setView('receipt');
    } catch {
      setSaleError('Couldn’t save the sale. Please try again.');
    } finally {
      setCompleting(false);
    }
  }

  if (view === 'floor') {
    return (
      <FloorPlan
        tenantName={device.tenant.name}
        branchName={device.branch.name}
        cashierName={shift.cashierName}
        tables={tables}
        onSelect={(t) => {
          setTable(t);
          setCart(emptyCart());
          setView('catalog');
        }}
        onEndShift={onEndShift}
      />
    );
  }

  if (view === 'checkout') {
    return (
      <Checkout
        cart={cart}
        cashierId={shift.cashierId}
        tableId={table?.id ?? null}
        showGratuity={restaurant}
        tenantRateBps={tenantRateBps}
        onCancel={() => setView('catalog')}
        onComplete={(sale) => {
          setLastSale(sale);
          setCart(emptyCart());
          setView('receipt');
        }}
      />
    );
  }

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

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 lg:flex-row">
      {/* Catalog / order */}
      <section className="flex-1 p-4">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{device.tenant.name}</h1>
              <p className="text-sm text-slate-500">
                {device.branch.name} · {shift.cashierName}
              </p>
            </div>
            {restaurant && table && (
              <button
                onClick={() => setView('floor')}
                className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Table {table.name} · change
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <SyncBadge />
            <button
              onClick={() => setShowTasks(true)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200"
            >
              Tasks
            </button>
            <button
              onClick={() => setShowPrinter(true)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200"
            >
              Printer
            </button>
            <button
              onClick={onEndShift}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200"
            >
              End shift
            </button>
          </div>
        </header>

        {showPrinter && <PrinterSettings onClose={() => setShowPrinter(false)} />}
        {showTasks && <TasksPanel cashierId={shift.cashierId} onClose={() => setShowTasks(false)} />}

        <div className="mb-4 flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, or barcode…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={() => (isScanSupported() ? setShowScanner(true) : setScanUnsupported(true))}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-700 hover:bg-slate-50"
          >
            <CameraIcon />
            Scan
          </button>
        </div>

        {scanUnsupported && (
          <p className="mb-3 text-sm text-amber-600">
            Camera scanning needs a secure connection (HTTPS) in a Chrome-based browser. A
            USB or Bluetooth barcode scanner works right now — it just types into the search
            box above.
            <button
              onClick={() => setScanUnsupported(false)}
              className="ml-2 font-medium underline"
            >
              Dismiss
            </button>
          </p>
        )}

        {scanMiss && (
          <p className="mb-3 text-sm text-amber-600">
            No product matches “{scanMiss}”. Search by name, or add it in the dashboard.
          </p>
        )}

        {showScanner && (
          <ScannerModal onDetected={handleScan} onClose={() => setShowScanner(false)} />
        )}

        {products.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <CategoryPill active={categoryId === null} onClick={() => setCategoryId(null)}>
              All Products
            </CategoryPill>
            {categories.map((c) => (
              <CategoryPill key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </CategoryPill>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <BoxIcon />
            <p className="mt-4 font-medium text-slate-500">No products yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Add products in the dashboard, then sync — they’ll appear here.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="mt-12 text-center text-slate-400">No products match “{search}”.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const qty = stock.get(p.id);
              const out = p.track_stock && qty !== undefined && qty <= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setCart((c) => addProduct(c, p))}
                  className="flex flex-col rounded-xl bg-white p-3 text-left shadow-sm transition hover:ring-2 hover:ring-blue-200"
                >
                  <span className="line-clamp-2 min-h-10 text-sm font-medium text-slate-900">
                    {p.name}
                  </span>
                  <span className="mt-2 text-base font-semibold text-slate-900">
                    {formatMoney(p.price_cents, p.currency)}
                  </span>
                  {p.track_stock && (
                    <span className={`mt-1 text-xs ${out ? 'text-red-500' : 'text-slate-400'}`}>
                      {out ? 'Out of stock' : `${qty ?? 0} in stock`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Cart — single-screen checkout for retail: method + totals + Complete Sale, all here */}
      <aside className="flex w-full flex-col border-t border-slate-200 bg-white lg:w-96 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">
            {restaurant && table ? `Table ${table.name}` : 'Cart'}
          </h2>
          {cart.lines.length > 0 && (
            <span className="text-xs text-slate-400">
              {cart.lines.reduce((n, l) => n + l.qty, 0)} item
              {cart.lines.reduce((n, l) => n + l.qty, 0) === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.lines.length === 0 ? (
            <div className="mt-8 flex flex-col items-center text-center">
              <CartIcon />
              <p className="mt-3 text-sm font-medium text-slate-500">Cart is empty</p>
              <p className="mt-1 text-xs text-slate-400">Tap a product to add it</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {cart.lines.map((line) => (
                <li key={line.product.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">{line.product.name}</div>
                    <div className="text-xs text-slate-500">
                      {formatMoney(line.product.price_cents, line.product.currency)} each
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <QtyButton onClick={() => setCart((c) => setQty(c, line.product.id, line.qty - 1))}>
                      −
                    </QtyButton>
                    <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                    <QtyButton onClick={() => setCart((c) => setQty(c, line.product.id, line.qty + 1))}>
                      +
                    </QtyButton>
                  </div>
                  <div className="w-16 text-right text-sm font-medium tabular-nums text-slate-900">
                    {formatMoney(line.product.price_cents * line.qty, line.product.currency)}
                  </div>
                  <button
                    onClick={() => setCart((c) => removeLine(c, line.product.id))}
                    className="text-slate-300 hover:text-red-500"
                    aria-label={`Remove ${line.product.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 p-4">
          {!restaurant && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Payment method
              </p>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMethod(m.value)}
                    className={`rounded-lg border py-2 text-sm font-medium ${
                      method === m.value
                        ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <Row label="Net (ex VAT)" value={formatMoney(totals.subtotal_cents)} />
          {totals.tax_cents > 0 && (
            <Row label={`VAT ${tenantRateBps / 100}% (included)`} value={formatMoney(totals.tax_cents)} />
          )}
          <div className="mt-2 flex justify-between text-lg font-semibold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totals.total_cents)}</span>
          </div>

          {saleError && <p className="mt-2 text-sm text-red-600">{saleError}</p>}

          <button
            onClick={restaurant ? () => setView('checkout') : completeRetailSale}
            disabled={cart.lines.length === 0 || completing}
            className="mt-4 w-full rounded-lg bg-[var(--brand)] py-3 font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {completing
              ? 'Saving…'
              : restaurant
                ? `Send & settle ${formatMoney(totals.total_cents)}`
                : `Complete Sale · ${formatMoney(totals.total_cents)}`}
          </button>
        </div>
      </aside>
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
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
        active ? 'bg-[var(--brand)] text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function QtyButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200"
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-slate-500">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="14" r="3.5" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
      <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}
