import { Head, router, usePage } from "@inertiajs/react";
import { useEffect } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface Item {
  name: string;
  qty: number;
}
interface Order {
  id: string;
  status: "new" | "preparing" | "ready";
  placed_at: string | null;
  table: string | null;
  items: Item[];
}
interface Props {
  orders: Order[];
  [key: string]: unknown;
}

const COLUMNS: { status: Order["status"]; title: string; next: string; action: string }[] = [
  { status: "new", title: "New", next: "preparing", action: "Start" },
  { status: "preparing", title: "Preparing", next: "ready", action: "Mark ready" },
  { status: "ready", title: "Ready", next: "served", action: "Served" },
];

function advance(id: string, status: string) {
  router.patch(`/kitchen/${id}`, { status }, { preserveScroll: true, preserveState: true });
}

function waited(placedAt: string | null): string {
  if (!placedAt) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(placedAt).getTime()) / 60000));
  return mins === 0 ? "just now" : `${mins} min`;
}

export default function KitchenIndex() {
  const { orders } = usePage<Props>().props;

  // Back-of-house screen: poll so new tickets and other stations' changes appear.
  useEffect(() => {
    const t = setInterval(() => router.reload({ only: ["orders"] }), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <AppLayout>
      <Head title="Kitchen" />
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Kitchen</h1>
      <p className="mt-1 text-sm text-slate-500">Tickets flow left to right. Tap to advance.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const inColumn = orders.filter((o) => o.status === col.status);
          return (
            <div key={col.status} className="rounded-xl bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-700">{col.title}</h2>
                <span className="text-xs text-slate-400">{inColumn.length}</span>
              </div>

              <div className="space-y-3">
                {inColumn.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">Nothing here.</p>
                ) : (
                  inColumn.map((o) => (
                    <div key={o.id} className="rounded-lg bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {o.table ? `Table ${o.table}` : "Counter"}
                        </span>
                        <span className="text-xs text-slate-400">{waited(o.placed_at)}</span>
                      </div>
                      <ul className="space-y-0.5 text-sm text-slate-700">
                        {o.items.map((it, i) => (
                          <li key={i}>
                            {it.qty} × {it.name}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => advance(o.id, col.next)}
                        className="mt-3 w-full rounded-lg bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        {col.action}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
