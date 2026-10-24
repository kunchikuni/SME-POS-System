import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api, type OrderRow } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import { DayPicker, METHOD_LABEL, dayHeading, longDate, useDayView } from "../../Components/DayPicker.js";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmt = (d: string) => new Date(d).toLocaleString();
const time = (d: string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const CAN_APPROVE = new Set(["owner", "manager"]);

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-positive/10 text-positive",
  voided: "bg-red-50 text-red-600",
  refunded: "bg-amber-50 text-amber-700",
};

export default function OrdersIndex() {
  usePageTitle("Orders");
  const { user } = useAuth();
  const { flash, showFlash } = useFlash();
  const [voidingSale, setVoidingSale] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  // One day at a time, in the business's local time (see Components/DayPicker).
  const { requestedDate, branchFilter, page, setPage, showDay: goToDay, showBranch } = useDayView();

  const { data, loading, refetch } = useQuery(
    () => api.orders.list({ page, date: requestedDate, branchId: branchFilter || undefined }),
    [page, requestedDate, branchFilter],
  );
  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 50;
  const shownDate = data?.date ?? null;
  const today = data?.today ?? null;
  const summary = data?.summary ?? null;

  const { data: branchData } = useQuery(() => api.branches.list(), []);
  const branches = branchData?.branches ?? [];

  const canApprove = user ? CAN_APPROVE.has(user.role) : false;

  // Only fetched for admins — a cashier never needs the approval queue.
  const { data: pendingData, refetch: refetchPending } = useQuery(
    () => (canApprove ? api.orders.pendingVoids() : Promise.resolve({ requests: [] })),
    [canApprove],
  );
  const pending = pendingData?.requests ?? [];

  const { submit: requestVoid, loading: requesting } = useMutation(
    ({ id, reason }: { id: string; reason: string }) => api.orders.requestVoid(id, reason),
    {
      onSuccess: (r) => {
        showFlash(r?.message ?? "Void requested.");
        setVoidingSale(null);
        setVoidReason("");
        refetch();
        if (canApprove) refetchPending();
      },
    },
  );

  const { submit: approveVoid } = useMutation(
    (id: string) => api.orders.approveVoid(id),
    { onSuccess: (r) => { showFlash(r?.message ?? "Sale voided."); refetch(); refetchPending(); } },
  );

  const { submit: rejectVoid } = useMutation(
    (id: string) => api.orders.rejectVoid(id),
    { onSuccess: (r) => { showFlash(r?.message ?? "Request rejected."); refetch(); refetchPending(); } },
  );

  return (
    <AppLayout>
      {flash.message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${flash.type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>
          {flash.message}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Orders</h1>
          <p className="mt-1 text-sm text-muted">
            {dayHeading(shownDate, today)}
          </p>
        </div>

        <DayPicker
          shownDate={shownDate}
          today={today}
          onDay={(d) => goToDay(d, today)}
          branches={branches}
          branchFilter={branchFilter}
          onBranch={showBranch}
        />
      </div>

      {/* The whole day's figures — not just this page of the list. Takings
          count completed sales only; voided sales were never money in. */}
      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Takings" value={money(summary.takingsCents)} />
          <SummaryCard label="Sales" value={String(summary.sales)} />
          <SummaryCard
            label="Average sale"
            value={summary.sales ? money(Math.round(summary.takingsCents / summary.sales)) : "—"}
          />
          <SummaryCard label="Voided" value={String(summary.voided)} muted={summary.voided === 0} />
          {summary.byMethod.length > 0 && (
            <div className="col-span-2 flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm sm:col-span-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">By payment</span>
              {summary.byMethod.map((m) => (
                <span key={m.method} className="text-ink">
                  {METHOD_LABEL[m.method] ?? m.method}{" "}
                  <span className="font-semibold tabular-nums">{money(m.amountCents)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin approval queue — only rendered for owner/manager, and only
          when something is actually waiting on them. */}
      {canApprove && pending.length > 0 && (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">
            {pending.length} void request{pending.length === 1 ? "" : "s"} waiting on you
          </h2>
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-ink">{r.requestedByName}</span>
                  <span className="text-muted"> wants to void a {money(r.sale?.totalCents ?? 0)} sale</span>
                  <p className="text-xs text-muted">"{r.reason}" · {fmt(r.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => rejectVoid(r.id)}
                    className="rounded-lg border border-hairline px-3 py-1 text-xs font-medium hover:bg-canvas"
                  >Reject</button>
                  <button
                    onClick={() => approveVoid(r.id)}
                    className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                  >Approve void</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <div className="mt-8 flex justify-center"><Spinner /></div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-canvas text-left text-xs font-semibold uppercase tracking-widest text-muted">
                  <th className="px-4 py-3">{shownDate ? "Time" : "Date"}</th>
                  <th className="px-4 py-3">Cashier</th>
                  {branches.length > 1 && !branchFilter && <th className="px-4 py-3">Branch</th>}
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Paid by</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted">
                      {shownDate ? `No sales on ${shownDate === today ? "this day yet" : longDate(shownDate)}.` : "No orders yet."}
                    </td>
                  </tr>
                )}
                {sales.map((s: OrderRow) => (
                  <tr key={s.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-3 text-muted tabular-nums">{shownDate ? time(s.occurredAt) : fmt(s.occurredAt)}</td>
                    <td className="px-4 py-3 text-ink">{s.cashier?.name ?? "—"}</td>
                    {branches.length > 1 && !branchFilter && <td className="px-4 py-3 text-muted">{s.branch?.name ?? "—"}</td>}
                    <td className="max-w-xs px-4 py-3 text-muted">
                      {/* What was sold, not just a count — "2 × Bread, 1 × Coke 500ml" */}
                      {(s.lines ?? []).map((l) => `${l.qty} × ${l.name}`).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {(s.payments ?? []).map((p) => METHOD_LABEL[p.method] ?? p.method).join(" + ") || "—"}
                      {s.customer && <span className="block text-xs">on account: {s.customer.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(s.totalCents ?? 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status] ?? "bg-canvas text-muted"}`}>
                        {s.status}
                      </span>
                      {s.voidRequest?.status === "pending" && (
                        <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          void pending
                        </span>
                      )}
                      {s.voidRequest?.status === "rejected" && (
                        <span className="ml-1 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                          void rejected
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.status === "completed" && !s.voidRequest && (
                        <button
                          onClick={() => { setVoidingSale(s.id); setVoidReason(""); }}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >Request void</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > perPage && (
            <div className="mt-4 flex justify-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs disabled:opacity-40">← Prev</button>
              <span className="px-3 py-1 text-sm text-muted">Page {page}</span>
              <button disabled={page * perPage >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs disabled:opacity-40">Next →</button>
            </div>
          )}
        </>
      )}

      {/* Request-void modal */}
      {voidingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Request void</h3>
              <button onClick={() => setVoidingSale(null)} className="text-muted hover:text-ink">✕</button>
            </div>
            <p className="mb-3 text-sm text-muted">
              This sends a request to your admin — the sale isn't voided until they approve it.
            </p>
            <label className="mb-1 block text-xs font-medium text-muted">Reason</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              placeholder="e.g. rang up the wrong item, customer walked out…"
              className="w-full rounded-xl border border-hairline px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setVoidingSale(null)} className="btn-secondary text-sm">Cancel</button>
              <button
                onClick={() => voidingSale && requestVoid({ id: voidingSale, reason: voidReason })}
                disabled={requesting || voidReason.trim().length < 3}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >{requesting ? "Sending…" : "Send request"}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function Spinner() { return <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />; }

function SummaryCard({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${muted ? "text-muted" : "text-ink"}`}>{value}</p>
    </div>
  );
}
