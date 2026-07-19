import { useState } from 'react';
import { formatMoney, taxOf, toCents } from '../lib/money';
import { cartTotals, type Cart } from '../pos/cart';
import { completeSale } from '../pos/checkout';
import type { PaymentMethod, SalePayload } from '../types/contract';

// The Zimbabwean tender rails a till actually sees at the counter.
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'ecocash', label: 'EcoCash' },
  { value: 'innbucks', label: 'InnBucks' },
  { value: 'omari', label: 'Omari' },
  { value: 'onemoney', label: 'OneMoney' },
  { value: 'zipit', label: 'ZIPIT' },
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
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <button onClick={onCancel} className="mb-4 text-sm text-slate-500 hover:text-slate-700">
          ← Back to order
        </button>

        {/* Net / VAT / Total breakdown — matches the fiscal receipt layout */}
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Net (ex VAT)</span>
            <span className="tabular-nums">{formatMoney(totals.subtotal_cents)}</span>
          </div>
          {tenantRateBps > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>VAT {ratePercent}% (included)</span>
              <span className="tabular-nums">{formatMoney(totals.tax_cents)}</span>
            </div>
          )}
          {gratuity > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>Gratuity</span>
              <span className="tabular-nums">{formatMoney(gratuity)}</span>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm text-slate-500">Total due</p>
          <p className="text-4xl font-semibold tabular-nums text-slate-900">
            {formatMoney(grandTotal)}
          </p>
        </div>

        {showGratuity && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-slate-700">Gratuity</p>
            <div className="grid grid-cols-5 gap-2">
              {TIPS.map((t) => (
                <button
                  key={t.bps}
                  onClick={() => setTipBps(t.bps)}
                  className={`rounded-lg border py-2 text-sm font-medium ${
                    tipBps === t.bps
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => setTipBps(-1)}
                className={`rounded-lg border py-2 text-sm font-medium ${
                  tipBps === -1
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
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
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            )}
          </div>
        )}

        <p className="mb-2 mt-6 text-sm font-medium text-slate-700">Payment method</p>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={`rounded-lg border py-2.5 text-sm font-medium ${
                method === m.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {method === 'cash' && (
          <div className="mt-4">
            <label className="block text-sm text-slate-600" htmlFor="received">
              Cash received (optional)
            </label>
            <input
              id="received"
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {change !== null && change >= 0 && (
              <p className="mt-2 text-sm text-slate-600">
                Change: <span className="font-semibold">{formatMoney(change)}</span>
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          onClick={confirm}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-[var(--brand)] py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Complete sale'}
        </button>
      </div>
    </div>
  );
}
