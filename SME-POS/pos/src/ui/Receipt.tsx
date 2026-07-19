import { formatMoney } from '../lib/money';
import { deviceBridge } from '../hardware/DeviceBridge';
import type { SalePayload } from '../types/contract';

/**
 * The receipt for a completed sale. Printing goes through the DeviceBridge, so
 * the same view works whether the host is a browser or a native shell. The
 * "provisional" note reflects that fiscal signing (ZIMRA) happens on sync in a
 * later phase — the sale is real now; the fiscal receipt catches up (§9.2).
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
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-xs">
        <div id="receipt" className="rounded-2xl bg-white p-6 shadow-sm">
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
            className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-700 hover:bg-white"
          >
            Print
          </button>
          <button
            onClick={onDone}
            className="flex-1 rounded-lg bg-[var(--brand)] py-2.5 font-medium text-white hover:opacity-90"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  );
}
