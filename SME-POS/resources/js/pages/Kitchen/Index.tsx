import { Head, router, usePage } from "@inertiajs/react";
import { useEffect, useRef, useState } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface Item {
  name: string;
  qty: number;
}
interface Order {
  id: string;
  ticket_no: number | null;
  status: "new" | "preparing" | "ready";
  placed_at: string | null;
  table: string | null;
  channel: "dine_in" | "counter";
  items: Item[];
}
interface Props {
  orders: Order[];
  [key: string]: unknown;
}

type Filter = "all" | "dine_in" | "counter";

const STATUS_STYLE: Record<Order["status"], { card: string; badge: string; dot: string }> = {
  new: { card: "border-blue-200 bg-blue-50", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  preparing: { card: "border-amber-300 bg-amber-50", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  ready: { card: "border-green-300 bg-green-50", badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
};

const NEXT: Record<Order["status"], { status: string; label: string; button: string }> = {
  new: { status: "preparing", label: "Accept", button: "bg-blue-600 hover:bg-blue-700" },
  preparing: { status: "ready", label: "Mark Ready", button: "bg-amber-600 hover:bg-amber-700" },
  ready: { status: "served", label: "Complete", button: "bg-green-600 hover:bg-green-700" },
};

function advance(id: string, status: string) {
  router.patch(`/kitchen/${id}`, { status }, { preserveScroll: true, preserveState: true });
}

function waited(placedAt: string | null): string {
  if (!placedAt) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(placedAt).getTime()) / 60000));
  return `${mins}m`;
}

/** A short synthesized beep — no audio file to ship, just an oscillator. */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Audio isn't available in every context (e.g. before a user gesture) — silently skip.
  }
}

export default function KitchenIndex() {
  const { orders } = usePage<Props>().props;
  const [filter, setFilter] = useState<Filter>("all");
  const [soundOn, setSoundOn] = useState(true);
  const lastNewCount = useRef<number | null>(null);

  const newCount = orders.filter((o) => o.status === "new").length;
  const cookingCount = orders.filter((o) => o.status === "preparing").length;
  const readyCount = orders.filter((o) => o.status === "ready").length;
  const activeCount = newCount + cookingCount;

  // Back-of-house screen: poll so new tickets and other stations' changes appear.
  useEffect(() => {
    const t = setInterval(() => router.reload({ only: ["orders"] }), 5000);
    return () => clearInterval(t);
  }, []);

  // Chime when a genuinely NEW ticket arrives (count goes up), not on every poll.
  useEffect(() => {
    if (soundOn && lastNewCount.current !== null && newCount > lastNewCount.current) {
      playChime();
    }
    lastNewCount.current = newCount;
  }, [newCount, soundOn]);

  const visible = orders.filter((o) => filter === "all" || o.channel === filter);

  return (
    <AppLayout>
      <Head title="Kitchen" />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Kitchen Display</h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeCount} active · {readyCount} ready
          </p>
        </div>
        <button
          onClick={() => setSoundOn((v) => !v)}
          className={`rounded-full p-2 ${soundOn ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}
          title={soundOn ? "Sound on — tap to mute" : "Sound off — tap to unmute"}
        >
          {soundOn ? <SoundOnIcon /> : <SoundOffIcon />}
        </button>
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {([
          ["all", "All"],
          ["dine_in", "Dine-in"],
          ["counter", "Counter"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              filter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> New ({newCount})</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Cooking ({cookingCount})</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Ready ({readyCount})</span>
      </div>

      <div className="mt-4 space-y-3">
        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No open tickets.</p>
        ) : (
          visible.map((o) => {
            const style = STATUS_STYLE[o.status];
            const next = NEXT[o.status];
            return (
              <div key={o.id} className={`rounded-xl border-2 p-4 ${style.card}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-900">
                      #{String(o.ticket_no ?? "—").padStart(3, "0")}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.badge}`}>
                      {o.channel === "counter" ? "COUNTER" : o.table ?? "TABLE"}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-600">
                    <ClockIcon /> {waited(o.placed_at)}
                  </span>
                </div>

                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {o.items.map((it, i) => (
                    <li key={i}>
                      {it.qty}× {it.name}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => advance(o.id, next.status)}
                  className={`mt-4 w-full rounded-lg py-3 text-sm font-semibold text-white ${next.button}`}
                >
                  {next.label}
                </button>
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
function SoundOnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
function SoundOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m23 9-6 6M17 9l6 6" />
    </svg>
  );
}
