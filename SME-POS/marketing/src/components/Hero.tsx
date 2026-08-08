import { IconCheck } from "./Icons";
import { REGISTER_URL } from "../config";

const DEMO_PRODUCTS = [
  { name: "Coca-Cola 500ml", price: 1.5 },
  { name: "Bread — White Loaf", price: 1.2 },
  { name: "Fresh Milk 1L", price: 2.5 },
  { name: "Chicken Portions 1kg", price: 5.99 },
];

/**
 * Ported verbatim from Home.tsx. Hero is deliberately dark REGARDLESS of the
 * page-wide toggle — device mockups read better against a dark stage, and
 * it gives the page one dramatic beat rather than uniform brightness
 * throughout. Everything below responds to the toggle normally.
 */
export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0a0612] px-6 pb-20 pt-16 sm:pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,58,237,0.22)_0%,transparent_70%)]" />

      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Built to keep selling through load-shedding and dropped signal
        </div>
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">
          Run your business smarter.
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Sell anywhere.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">
          WivaePOS manages sales, inventory, staff, and reporting in real time across every device and branch —
          built offline-first for how Zimbabwean businesses actually trade.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a
            href={REGISTER_URL}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-7 py-3.5 text-sm font-bold text-white shadow-[0_4px_24px_rgba(124,58,237,0.4)] hover:opacity-90 transition-opacity"
          >
            Start 7-day free trial
          </a>
          <a
            href="#pricing"
            className="rounded-xl border border-white/15 px-7 py-3.5 text-sm font-semibold text-white/80 hover:bg-white/5 transition-colors"
          >
            See pricing
          </a>
        </div>
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-white/40">
          <span className="flex items-center gap-1.5"><IconCheck /> 7-day free trial — $0 due today</span>
          <span className="flex items-center gap-1.5"><IconCheck /> No credit card</span>
          <span className="flex items-center gap-1.5"><IconCheck /> Cancel anytime</span>
        </p>
      </div>

      <DeviceMockups />
    </section>
  );
}

/**
 * Our own device composition, not a copy of any reference layout's specific
 * artwork — a monitor showing the real dashboard's actual layout (KPI cards,
 * revenue chart, top products), a phone showing the real till's product
 * grid (the till genuinely is a mobile-installable PWA), and the actual
 * Bluetooth thermal printer hardware bundle sold on Standard/Premium.
 * Full-bleed and genuinely 3D via real rotateY/rotateX/translateZ
 * transforms per device, not a drop-shadow pretending to be depth.
 */
function DeviceMockups() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-[1600px] px-4" style={{ perspective: "2400px" }}>
      <div className="pointer-events-none absolute -inset-20 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.18)_0%,transparent_70%)]" />
      <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-end lg:justify-center lg:gap-0">
        {/* Monitor — dashboard */}
        <div
          className="w-full max-w-3xl lg:-mr-16 lg:w-[58%]"
          style={{ transform: "rotateY(10deg) rotateX(3deg)", transformStyle: "preserve-3d" }}
        >
          <div className="overflow-hidden rounded-t-2xl border border-white/10 bg-white/[0.03] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            </div>
            <div className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-display text-base font-bold text-white">WivaePOS</span>
                <span className="text-xs text-white/40">Welcome back</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { l: "Revenue", v: "$4,950", tint: "from-violet-500 to-indigo-500" },
                  { l: "Orders", v: "129", tint: "from-emerald-500 to-teal-500" },
                  { l: "Products", v: "86", tint: "from-fuchsia-500 to-violet-500" },
                  { l: "Staff", v: "12", tint: "from-orange-500 to-amber-500" },
                ].map((k) => (
                  <div key={k.l} className="rounded-lg bg-white/5 p-3">
                    <div className={`mb-1.5 h-1 w-8 rounded-full bg-gradient-to-r ${k.tint}`} />
                    <div className="text-[11px] text-white/40">{k.l}</div>
                    <div className="text-lg font-bold text-white">{k.v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex h-28 items-end gap-2 rounded-lg bg-white/5 p-3">
                {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-violet-500 to-indigo-400" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="mx-auto h-5 w-32 bg-white/8" />
          <div className="mx-auto h-2 w-56 rounded-full bg-white/10" />
        </div>

        {/* Phone — till */}
        <div
          className="relative z-10 w-56 shrink-0 lg:w-64"
          style={{ transform: "rotateY(-14deg) rotateX(2deg) translateZ(60px)", transformStyle: "preserve-3d" }}
        >
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-2 shadow-[0_40px_100px_-15px_rgba(0,0,0,0.75)] backdrop-blur-sm">
            <div className="overflow-hidden rounded-[1.5rem] bg-black/40">
              <div className="flex items-center justify-between px-4 pt-4">
                <span className="text-xs font-bold text-white">WivaePOS</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {DEMO_PRODUCTS.map((p) => (
                  <div key={p.name} className="rounded-lg bg-white/5 p-2.5">
                    <div className="mb-1.5 h-1 w-5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 opacity-70" />
                    <div className="truncate text-[11px] font-medium text-white/80">{p.name}</div>
                    <div className="text-xs font-bold text-violet-300">${p.price.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              <div className="mx-3 mb-3 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 py-2.5 text-center text-xs font-bold text-white">
                Charge $10.19
              </div>
            </div>
          </div>
        </div>

        {/* Receipt printer */}
        <div
          className="relative hidden shrink-0 lg:-ml-10 lg:mb-2 lg:block"
          style={{ transform: "rotateY(14deg) rotateX(4deg)", transformStyle: "preserve-3d" }}
        >
          <div className="relative">
            <div className="h-24 w-44 rounded-2xl bg-gradient-to-b from-[#1e1e1e] to-[#0a0a0a] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]" />
            <div className="absolute inset-x-3 top-3 h-12 rounded-xl bg-white/95 p-2">
              <div className="h-1.5 w-full bg-slate-300" />
              <div className="mt-1.5 h-1.5 w-3/4 bg-slate-300" />
              <div className="mt-1.5 h-1.5 w-5/6 bg-slate-300" />
            </div>
            <div className="absolute bottom-3 right-4 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          </div>
          <p className="mt-3 text-center text-xs text-white/30">Bluetooth thermal printer</p>
        </div>
      </div>
    </div>
  );
}
