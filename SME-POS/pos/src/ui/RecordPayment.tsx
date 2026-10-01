import { useMemo, useState } from 'react';
import { enqueue } from '../sync/outbox';
import { syncManager } from '../sync/syncManager';
import { db } from '../db/database';
import { formatMoney, toCents } from '../lib/money';
import type { Customer, DebtRepayMutation } from '../types/contract';

const METHODS: { value: DebtRepayMutation['method']; label: string }[] = [
  { value: 'cash',     label: 'Cash' },
  { value: 'ecocash',  label: 'EcoCash' },
  { value: 'zipit',    label: 'ZIPIT' },
];

/**
 * Record a repayment against a customer's credit balance — the other half
 * of credit sales (see RetailTill's 'Credit' payment option). Without this,
 * balanceCents could only ever go up, which isn't a usable feature, just
 * half of one.
 *
 * Queues a debt.repay mutation through the same outbox a sale uses, so a
 * repayment can be recorded without a live connection, same reasoning as
 * ReceiveStock. Gated to owner/manager in the caller (see RetailTill) —
 * same reasoning as ReceiveStock's gate: a repayment record has no
 * independent proof the money actually changed hands, so it carries the
 * same trust requirement as a manual stock adjustment, not the automatic
 * cross-check a sale's own payment total provides.
 */
export function RecordPayment({
  customers,
  onClose,
}: {
  customers: Customer[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DebtRepayMutation['method']>('cash');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ name: string; amountCents: number } | null>(null);

  // Only customers who actually owe something — someone with a zero or
  // negative balance (already settled, or overpaid) has nothing to record
  // a payment against here.
  const debtors = useMemo(() => customers.filter((c) => c.balance_cents > 0), [customers]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return debtors.slice(0, 8);
    return debtors.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [search, debtors]);

  const amountCents = toCents(amount);

  async function submit() {
    if (!selected || amountCents < 1) return;

    setSaving(true);
    try {
      const id = crypto.randomUUID();
      // Queue AND reduce the local balance together (same pattern as a sale's
      // stock decrement), so the new balance shows here straight away and
      // offline; the next pull replaces it with the server's figure.
      await db.transaction('rw', db.outbox, db.customers, async () => {
        await enqueue(id, {
          type: 'debt.repay',
          id,
          customer_id: selected.id,
          amount_cents: amountCents,
          method,
          occurred_at: new Date().toISOString(),
        });
        const current = await db.customers.get(selected.id);
        if (current) await db.customers.put({ ...current, balance_cents: current.balance_cents - amountCents });
      });
      void syncManager.sync(); // push now rather than on the next 30s poll; safe offline
      setDone({ name: selected.name, amountCents });
      setSelected(null);
      setAmount('');
      setSearch('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 anim-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-sm anim-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Record payment</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close">
            ✕
          </button>
        </div>

        {done && (
          <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300 ring-1 ring-emerald-500/20">
            Queued {formatMoney(done.amountCents)} from {done.name}. It'll sync next time this till is online — this works offline, it doesn't need a connection now.
          </div>
        )}

        <div className="mt-4">
          {!selected ? (
            <>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer…"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
              />
              {results.length > 0 ? (
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto dark-scroll">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelected(c)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/6 transition-colors"
                      >
                        <span>{c.name}</span>
                        <span className="text-xs tabular-nums text-amber-400">{formatMoney(c.balance_cents)} owed</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  {debtors.length === 0 ? 'No customers currently owe anything.' : `No debtor matches "${search}".`}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-white">{selected.name}</p>
                  <p className="text-xs text-amber-400">Owes: {formatMoney(selected.balance_cents)}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >Change</button>
              </div>

              <label className="mt-4 block text-xs font-medium text-slate-400">Amount received</label>
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm tabular-nums text-white placeholder-slate-600 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
              />

              <div className="mt-3 flex gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMethod(m.value)}
                    className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                      method === m.value ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40' : 'bg-white/5 text-slate-400 hover:bg-white/8'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <button
                onClick={submit}
                disabled={saving || amountCents < 1}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Saving…' : 'Record payment'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
