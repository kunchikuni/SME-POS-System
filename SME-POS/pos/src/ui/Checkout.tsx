import { useState } from 'react';
import { formatMoney, taxOf, toCents } from '../lib/money';
import { cartTotals, type Cart } from '../pos/cart';
import { completeSale } from '../pos/checkout';
import type { PaymentMethod, SalePayload } from '../types/contract';

// The Zimbabwean tender rails a till actually sees at the counter.
const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash',     label: 'Cash',     icon: '💵' },
  { value: 'ecocash',  label: 'EcoCash',  icon: '📱' },
  { value: 'innbucks', label: 'InnBucks', icon: '🏦' },
  { value: 'omari',    label: 'Omari',    icon: '💳' },
  { value: 'onemoney', label: 'OneMoney', icon: '📲' },
  { value: 'zipit',    label: 'ZIPIT',    icon: '⚡' },
];

// Tip presets in basis points; -1 is the "custom amount" sentinel.
const TIPS: { label: string; bps: number }[] = [
  { label: 'None', bps: 0 },
  { label: '10%', bps: 1000 },
  { label: '12.5%', bps: 1250 },
  { label: '15%', bps: 1500 },
];

/**
 * Settle a sale: choose a tender label (Wivae never processes the money,
 * §1/§9.1) and, in restaurant mode, add a gratuity. VAT is inclusive (§3), so
 * the "Total" below is simply the sum of shelf prices + gratuity; "Net (ex VAT)"
 * and "VAT X% (included)" are the breakdown backed out of that total for the
 * receipt — they never change what's charged.
 *
 * Only reached from RestaurantTill (retail's checkout is inline in its own
 * cart panel) — orange/amber accent to match, not a generic brand blue.
 */
export function Checkout({
  cart,
  cashierId,
  onComplete,
  onCancel,
  tableId = null,
  showGratuity = false,
  tenantRateBps,
}: {
  cart: Cart;
  cashierId: string | null;
  onComplete: (sale: SalePayload) => void;
  onCancel: () => void;
  tableId?: string | null;
  showGratuity?: boolean;
  tenantRateBps: number;
}) {
  const totals = cartTotals(cart, tenantRateBps);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tipBps, setTipBps] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Defaults true — every existing restaurant checkout already expected a
  // kitchen ticket, so this preserves that behavior. The opt-out is for the
  // rare no-prep sale (a bottled drink, a packet of chips) that doesn't need
  // one, without forcing the cashier to leave the restaurant flow to ring it
  // up. Independent of table selection: a Counter order (no table) can still
  // need the kitchen, same as a table order can skip it.
  const [routeToKitchen, setRouteToKitchen] = useState(true);

  const gratuity = !showGratuity
    ? 0
    : tipBps === -1
      ? toCents(customTip)
      : taxOf(totals.total_cents, tipBps); // tip is a % of what the customer pays, not the ex-VAT net

  const grandTotal = totals.total_cents + gratuity;

  const receivedCents = toCents(received);
  const change = method === 'cash' && receivedCents > 0 ? receivedCents - grandTotal : null;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const sale = await completeSale(cart, {
        cashierId,
        payments: [{ method, amount_cents: grandTotal }],
        tableId,
        routeToKitchen,
        gratuityCents: gratuity,
        tenantRateBps,
      });
      onComplete(sale);
    } catch {
      setError('Couldn’t save the sale. Please try again.');
      setBusy(false);
    }
  }

  const ratePercent = tenantRateBps / 100;

  return (
    <div className="grid min-h-dvh place-items-center resto-floor-bg p-4 sm:p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(234,88,12,0.10)_0%,transparent_65%)]" />

      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-sm anim-pop-in dark-scroll max-h-[92vh] overflow-y-auto">
        <button onClick={onCancel} className="mb-4 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          ← Back to order
        </button>

        {/* Net / VAT / Total breakdown — matches the fiscal receipt layout */}
        <div className="space-y-1 rounded-xl bg-white/5 p-3 text-sm ring-1 ring-white/8">
          <div className="flex justify-between text-slate-400">
            <span>Net (ex VAT)</span>
            <span className="tabular-nums">{formatMoney(totals.subtotal_cents)}</span>
          </div>
          {tenantRateBps > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>VAT {ratePercent}% (included)</span>
              <span className="tabular-nums">{formatMoney(totals.tax_cents)}</span>
            </div>
          )}
          {gratuity > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Gratuity</span>
              <span className="tabular-nums">{formatMoney(gratuity)}</span>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm text-slate-500">Total due</p>
          <p className="text-4xl font-bold tabular-nums text-white">
            {formatMoney(grandTotal)}
          </p>
        </div>

        {showGratuity && (
          <div className="mt-6">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Gratuity</p>
            <div className="grid grid-cols-5 gap-1.5">
              {TIPS.map((t) => (
                <button
                  key={t.bps}
                  onClick={() => setTipBps(t.bps)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                    tipBps === t.bps
                      ? 'border-orange-500/60 bg-orange-500/20 text-orange-200 shadow-[0_0_10px_rgba(234,88,12,0.25)]'
                      : 'border-white/8 text-slate-400 hover:border-white/16 hover:bg-white/5'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => setTipBps(-1)}
                className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                  tipBps === -1
                    ? 'border-orange-500/60 bg-orange-500/20 text-orange-200 shadow-[0_0_10px_rgba(234,88,12,0.25)]'
                    : 'border-white/8 text-slate-400 hover:border-white/16 hover:bg-white/5'
                }`}
              >
                Custom
              </button>
            </div>
            {tipBps === -1 && (
              <input
                inputMode="decimal"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                placeholder="Tip amount"
                className="mt-2 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm tabular-nums text-white placeholder-slate-600 outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all"
              />
            )}
          </div>
        )}

        <label className="mt-6 flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-slate-200">
            <span>🔥</span>
            <span>Send to kitchen</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={routeToKitchen}
            onClick={() => setRouteToKitchen((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              routeToKitchen ? 'bg-orange-500' : 'bg-white/15'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                routeToKitchen ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
        {!routeToKitchen && (
          <p className="mt-1.5 text-xs text-slate-500">
            No kitchen ticket for this sale — use this for something that doesn't need prep.
          </p>
        )}

        <p className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Payment method</p>
        <div className="grid grid-cols-3 gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs font-medium transition-all ${
                method === m.value
                  ? 'border-orange-500/60 bg-orange-500/20 text-orange-200 shadow-[0_0_10px_rgba(234,88,12,0.25)]'
                  : 'border-white/8 text-slate-400 hover:border-white/16 hover:bg-white/5'
              }`}
            >
              <span className="text-base">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {method === 'cash' && (
          <div className="mt-4">
            <label className="block text-xs text-slate-500" htmlFor="received">
              Cash received (optional)
            </label>
            <input
              id="received"
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm tabular-nums text-white placeholder-slate-600 outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all"
            />
            {change !== null && change >= 0 && (
              <p className="mt-2 text-sm text-slate-400">
                Change: <span className="font-semibold text-white">{formatMoney(change)}</span>
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          onClick={confirm}
          disabled={busy}
          className="btn-resto mt-6 w-full rounded-xl py-3.5 font-bold text-white text-sm tracking-wide"
        >
          {busy ? 'Saving…' : 'Complete sale'}
        </button>
      </div>
    </div>
  );
}
