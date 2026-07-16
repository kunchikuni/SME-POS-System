import { useState } from 'react';
import { formatMoney, toCents } from '../lib/money';
import { cartTotals, type Cart } from '../pos/cart';
import { completeSale } from '../pos/checkout';
import type { PaymentMethod, SalePayload } from '../types/contract';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'ecocash', label: 'EcoCash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank' },
];

/**
 * Records how the customer paid — a label for the merchant's reporting. Wivae
 * never processes the money (docs/ARCHITECTURE.md §1, §9.1). For cash we offer
 * an optional "received" field to show change; the recorded payment is always
 * the sale total.
 */
export function Checkout({
  cart,
  cashierId,
  onComplete,
  onCancel,
}: {
  cart: Cart;
  cashierId: string | null;
  onComplete: (sale: SalePayload) => void;
  onCancel: () => void;
}) {
  const totals = cartTotals(cart);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receivedCents = toCents(received);
  const change = method === 'cash' && receivedCents > 0 ? receivedCents - totals.total_cents : null;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const sale = await completeSale(cart, {
        cashierId,
        payments: [{ method, amount_cents: totals.total_cents }],
      });
      onComplete(sale);
    } catch {
      setError('Couldn’t save the sale. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <button onClick={onCancel} className="mb-4 text-sm text-slate-500 hover:text-slate-700">
          ← Back to sale
        </button>

        <div className="text-center">
          <p className="text-sm text-slate-500">Total due</p>
          <p className="text-4xl font-semibold tabular-nums text-slate-900">
            {formatMoney(totals.total_cents)}
          </p>
        </div>

        <p className="mt-6 mb-2 text-sm font-medium text-slate-700">Payment method</p>
        <div className="grid grid-cols-2 gap-2">
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
          className="mt-6 w-full rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Complete sale'}
        </button>
      </div>
    </div>
  );
}
