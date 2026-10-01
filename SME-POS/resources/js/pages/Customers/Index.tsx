import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api, type CreditCustomer } from "../../lib/api.js";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const date = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "ecocash", label: "EcoCash" },
  { value: "zipit", label: "ZIPIT" },
  { value: "other", label: "Other" },
];

/**
 * Customers who buy on credit ("on account") at the till. The till creates
 * them on their first credit sale and records repayments there too; this is
 * the owner's view: who owes what, each customer's statement, and recording
 * a payment received away from the till.
 */
export default function CustomersIndex() {
  usePageTitle("Customers");
  const { flash, showFlash } = useFlash();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery(() => api.customers.list(q || undefined), [q]);
  const customers = data?.customers ?? [];
  const owing = customers.filter((c) => c.balanceCents > 0).length;

  return (
    <AppLayout>
      {flash.message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${flash.type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>
          {flash.message}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Customers</h1>
          <p className="mt-1 text-sm text-muted">People who buy on credit at the till, and what they owe</p>
        </div>
        <div className="rounded-xl border border-hairline bg-surface px-4 py-2 text-right">
          <p className="text-xs uppercase tracking-widest text-muted">Total owed</p>
          <p className="text-lg font-semibold tabular-nums text-ink">{money(data?.totalOwedCents ?? 0)}</p>
          <p className="text-xs text-muted">{owing} customer{owing === 1 ? "" : "s"} owing</p>
        </div>
      </div>

      <div className="mt-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full max-w-sm rounded-xl border border-hairline bg-surface px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-canvas text-left text-xs font-semibold uppercase tracking-widest text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Owes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    {q ? `No customer matches "${q}".` : "No credit customers yet. They're added at the till when someone buys on credit."}
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-canvas/50" onClick={() => setOpenId(c.id)}>
                  <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${c.balanceCents > 0 ? "text-red-600" : c.balanceCents < 0 ? "text-positive" : "text-muted"}`}>
                    {money(c.balanceCents)}
                    {c.balanceCents < 0 && <span className="ml-1 text-xs font-normal">in credit</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <CustomerPanel
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={(message) => { showFlash(message); refetch(); }}
          onRemoved={(message) => { showFlash(message); setOpenId(null); refetch(); }}
        />
      )}
    </AppLayout>
  );
}

function CustomerPanel({ id, onClose, onChanged, onRemoved }: {
  id: string;
  onClose: () => void;
  onChanged: (message: string) => void;
  onRemoved: (message: string) => void;
}) {
  const { data, loading, refetch } = useQuery(() => api.customers.show(id), [id]);
  const customer = data?.customer;
  const entries = data?.entries ?? [];
  const products = data?.products ?? [];

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const amountCents = Math.round((parseFloat(amount) || 0) * 100);

  const { submit: pay, loading: paying, error: payError } = useMutation(
    () => api.customers.recordPayment(id, { amountCents, method }),
    { onSuccess: (r) => { setAmount(""); refetch(); onChanged(r?.message ?? "Payment recorded."); } },
  );
  const { submit: save, loading: saving, error: saveError, errors: saveErrors } = useMutation(
    () => api.customers.update(id, { name: name.trim(), phone: phone.trim() || null }),
    { onSuccess: () => { setEditing(false); refetch(); onChanged("Customer updated."); } },
  );
  const { submit: remove, error: removeError } = useMutation(
    () => api.customers.delete(id),
    { onSuccess: (r) => onRemoved(r?.message ?? "Customer removed.") },
  );

  function startEdit(c: CreditCustomer) {
    setName(c.name);
    setPhone(c.phone ?? "");
    setEditing(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          {customer && !editing ? (
            <div>
              <h2 className="text-lg font-semibold text-ink">{customer.name}</h2>
              <p className="text-sm text-muted">{customer.phone ?? "No phone"}</p>
              <button onClick={() => startEdit(customer)} className="mt-1 text-xs text-brand-600 hover:underline">Edit details</button>
            </div>
          ) : editing ? (
            <div className="mr-4 flex-1 space-y-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
                className="w-full rounded-xl border border-hairline px-3 py-2 text-sm" />
              {saveErrors.name && <p className="text-xs text-red-600">{saveErrors.name}</p>}
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)"
                className="w-full rounded-xl border border-hairline px-3 py-2 text-sm" />
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              <div className="flex gap-2">
                <button onClick={() => save(undefined)} disabled={saving || !name.trim()} className="btn-primary text-xs disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} className="btn-secondary text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <span />
          )}
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>

        {loading || !customer ? (
          <div className="mt-8 flex justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-xl bg-canvas p-4">
              <p className="text-xs uppercase tracking-widest text-muted">{customer.balanceCents < 0 ? "In credit" : "Owes"}</p>
              <p className={`text-2xl font-semibold tabular-nums ${customer.balanceCents > 0 ? "text-red-600" : "text-ink"}`}>
                {money(Math.abs(customer.balanceCents))}
              </p>
            </div>

            {/* Record a payment received outside the till */}
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-ink">Record a payment</p>
              <div className="flex gap-2">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className="w-28 rounded-xl border border-hairline px-3 py-2 text-sm tabular-nums"
                />
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-xl border border-hairline px-2 py-2 text-sm">
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <button onClick={() => pay(undefined)} disabled={paying || amountCents < 1} className="btn-primary text-sm disabled:opacity-50">
                  {paying ? "Saving…" : "Record"}
                </button>
              </div>
              {amountCents > 0 && (
                <p className="mt-1 text-xs text-muted">
                  Will owe {money(customer.balanceCents - amountCents)} after this.
                </p>
              )}
              {payError && <p className="mt-1 text-xs text-red-600">{payError}</p>}
            </div>

            {/* What they've taken on account, per product */}
            {products.length > 0 && (
              <>
                <p className="mb-2 mt-6 text-sm font-medium text-ink">Bought on credit</p>
                <ul className="divide-y divide-hairline rounded-xl border border-hairline">
                  {products.map((p) => (
                    <li key={p.name} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-ink">
                        {p.name} <span className="text-muted">× {p.qty}</span>
                      </span>
                      <span className="tabular-nums text-muted">{money(p.totalCents)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Statement */}
            <p className="mb-2 mt-6 text-sm font-medium text-ink">Statement</p>
            {entries.length === 0 ? (
              <p className="text-sm text-muted">No credit sales or payments yet.</p>
            ) : (
              <ul className="divide-y divide-hairline rounded-xl border border-hairline">
                {entries.map((e) => {
                  const voided = e.kind === "sale" && e.status !== "completed";
                  return (
                    <li key={`${e.kind}-${e.id}`} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={voided ? "text-muted line-through" : "text-ink"}>{e.note}</p>
                          <p className="text-xs text-muted">{date(e.at)}{e.branch ? ` · ${e.branch}` : ""}</p>
                        </div>
                        <span className={`tabular-nums font-medium ${voided ? "text-muted line-through" : e.kind === "payment" ? "text-positive" : "text-red-600"}`}>
                          {e.kind === "payment" ? "−" : "+"}{money(e.amountCents)}
                        </span>
                      </div>
                      {/* The products on this credit sale */}
                      {e.items && e.items.length > 0 && (
                        <ul className={`mt-1.5 space-y-0.5 border-l-2 border-hairline pl-3 text-xs ${voided ? "text-muted line-through" : "text-muted"}`}>
                          {e.items.map((it, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span>{it.qty} × {it.name} <span className="opacity-70">@ {money(it.unitPriceCents)}</span></span>
                              <span className="tabular-nums">{money(it.lineTotalCents)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {customer.balanceCents === 0 && (
              <button
                onClick={() => confirm(`Remove ${customer.name}? They owe nothing, and past sales keep their record.`) && remove(undefined)}
                className="mt-6 self-start rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Remove customer
              </button>
            )}
            {removeError && <p className="mt-1 text-xs text-red-600">{removeError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
