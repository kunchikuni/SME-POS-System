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
import { isRestaurant } from '../pos/mode';
import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';
import type { Product, SalePayload, StockLevel, Table } from '../types/contract';
import { SyncBadge } from './Shared';
import { Checkout } from './Checkout';
import { Receipt } from './Receipt';
import { PrinterSettings } from './PrinterSettings';
import { FloorPlan } from './FloorPlan';

type View = 'floor' | 'catalog' | 'checkout' | 'receipt';

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
  const stockRows = useLiveQuery(() => db.stock.toArray(), [], [] as StockLevel[]);
  const tables = useLiveQuery(() => db.diningTables.toArray(), [], [] as Table[]);

  const [cart, setCart] = useState<Cart>(emptyCart);
  const [view, setView] = useState<View>(restaurant ? 'floor' : 'catalog');
  const [table, setTable] = useState<Table | null>(null);
  const [lastSale, setLastSale] = useState<SalePayload | null>(null);
  const [search, setSearch] = useState('');
  const [showPrinter, setShowPrinter] = useState(false);

  const stock = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stockRows) map.set(row.product_id, row.quantity);
    return map;
  }, [stockRows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.is_active)
      .filter((p) =>
        q === ''
          ? true
          : p.name.toLowerCase().includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q) ||
            (p.barcode ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search]);

  const totals = cartTotals(cart);

  function newOrder() {
    setCart(emptyCart());
    setTable(null);
    setView(restaurant ? 'floor' : 'catalog');
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

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search or scan a product…"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        {visible.length === 0 ? (
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

      {/* Cart */}
      <aside className="flex w-full flex-col border-t border-slate-200 bg-white lg:w-96 lg:border-l lg:border-t-0">
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="mb-3 font-semibold text-slate-900">
            {restaurant && table ? `Table ${table.name}` : 'Current sale'}
          </h2>
          {cart.lines.length === 0 ? (
            <p className="mt-8 text-center text-sm text-slate-400">
              Tap a product to add it to the {restaurant ? 'order' : 'sale'}.
            </p>
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
          <Row label="Subtotal" value={formatMoney(totals.subtotal_cents)} />
          {totals.tax_cents > 0 && <Row label="Tax" value={formatMoney(totals.tax_cents)} />}
          <div className="mt-2 flex justify-between text-lg font-semibold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totals.total_cents)}</span>
          </div>
          <button
            onClick={() => setView('checkout')}
            disabled={cart.lines.length === 0}
            className="mt-4 w-full rounded-lg bg-[var(--brand)] py-3 font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {restaurant ? 'Send & settle' : 'Charge'} {formatMoney(totals.total_cents)}
          </button>
        </div>
      </aside>
    </div>
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
