import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";
import { useState } from "react";

export default function KitchenIndex() {
  usePageTitle("Kitchen Display");
  const { data, loading, refetch } = useQuery(() => api.kitchen.list(), []);
  const orders = data?.orders ?? [];

  const { submit: updateStatus } = useMutation(
    ({ id, status }: { id: string; status: string }) => api.kitchen.updateStatus(id, status),
    { onSuccess: () => refetch() }
  );

  const STATUS_COLORS: Record<string, string> = {
    new: "border-amber-300 bg-amber-50",
    preparing: "border-blue-300 bg-blue-50",
    ready: "border-positive/40 bg-positive/5",
    served: "border-hairline bg-canvas",
  };
  const NEXT: Record<string, string> = { new: "preparing", preparing: "ready", ready: "served" };

  return (
    <AppLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Kitchen Display</h1>
      <p className="mt-1 text-sm text-muted">{orders.length} active order{orders.length !== 1 ? "s" : ""}</p>

      {loading ? <div className="mt-8 flex justify-center"><Spinner /></div> : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.length === 0 && (
            <p className="col-span-full text-center text-muted py-12">No active orders — all caught up! 🎉</p>
          )}
          {(orders as any[]).map((o: any) => (
            <div key={o.id} className={`rounded-xl border-2 p-4 ${STATUS_COLORS[o.status] ?? STATUS_COLORS.new}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-ink">{o.table?.name ?? "Takeaway"}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                  o.status === "new" ? "bg-amber-200 text-amber-800" :
                  o.status === "preparing" ? "bg-blue-200 text-blue-800" :
                  "bg-positive/20 text-positive"
                }`}>{o.status}</span>
              </div>
              <ul className="space-y-1 text-sm">
                {o.sale?.lines?.map((l: any, i: number) => (
                  <li key={i} className="flex justify-between">
                    <span>{l.product?.name ?? l.name}</span>
                    <span className="font-semibold">×{l.qty}</span>
                  </li>
                ))}
              </ul>
              {NEXT[o.status] && (
                <button
                  onClick={() => updateStatus({ id: o.id, status: NEXT[o.status] })}
                  className="mt-3 w-full rounded-lg bg-ink py-2 text-xs font-semibold text-white hover:opacity-90 capitalize"
                >
                  Mark as {NEXT[o.status]}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
function Spinner() { return <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />; }
