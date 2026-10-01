import type { ReactNode } from "react";
import {
  IconCheck, IconPalette, IconReceipt, IconSparkles, IconStore, IconTable, IconTill, IconUsers, IconWifiOff,
} from "./Icons";

/** The three headline numbers. "Ten" = the business types sign-up sets up (server/src/domain/businessTypes.ts). */
export function OfflineStrip() {
  const points = [
    { k: "Zero", v: "sales lost to a dropped connection" },
    { k: "Seconds", v: "to reconcile every branch once you're back online" },
    { k: "Ten", v: "kinds of business set up for you — from shops and salons to pharmacies" },
  ];
  return (
    <section className="border-b border-hairline bg-surface px-6 py-14 transition-colors">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-hairline">
        {points.map((p) => (
          <div key={p.k} className="reveal text-center sm:px-8">
            <div className="bg-gradient-to-br from-brand-500 to-fuchsia-500 bg-clip-text font-display text-5xl font-extrabold tracking-tight text-transparent sm:text-6xl">
              {p.k}
            </div>
            <div className="mx-auto mt-2 max-w-[15rem] text-sm leading-relaxed text-muted">{p.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** One tile of the bento grid. `className` sets its span; `children` is an optional illustration. */
function Tile({ icon, title, body, className = "", children }: {
  icon: ReactNode; title: string; body: string; className?: string; children?: ReactNode;
}) {
  return (
    <div className={`reveal group relative flex flex-col overflow-hidden rounded-3xl border border-hairline bg-surface p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-[0_24px_50px_-28px_rgba(124,58,237,0.5)] sm:p-7 ${className}`}>
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-fuchsia-500/10 text-brand-500 ring-1 ring-brand-500/15 transition-transform duration-300 group-hover:scale-105">
        {icon}
      </div>
      <h3 className="font-display text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      {children}
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Features</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Built for how you actually trade</h2>
          <p className="mt-4 text-base leading-relaxed text-muted">Not a generic POS with local features bolted on — designed around a Zimbabwean SME from the first line of code.</p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* The big one: the promise the whole product is built on. */}
          <Tile
            className="sm:col-span-2 lg:row-span-2"
            icon={<IconWifiOff />}
            title="Actually offline"
            body="Not a cache trick. Sales, stock, and staff all work locally first, then reconcile — load-shedding doesn't stop a sale."
          >
            <div className="mt-6 flex-1 space-y-2.5 rounded-2xl bg-canvas p-4 ring-1 ring-hairline" aria-hidden="true">
              {[
                { t: "Sale #0141", a: "$12.50", s: "Synced", ok: true },
                { t: "Sale #0142", a: "$3.20", s: "Waiting to sync", ok: false },
                { t: "Sale #0143", a: "$27.90", s: "Waiting to sync", ok: false },
              ].map((r) => (
                <div key={r.t} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm ring-1 ring-hairline sm:px-3.5">
                  <span className="whitespace-nowrap font-medium">{r.t}</span>
                  <span className="flex items-center gap-2 sm:gap-3">
                    <span className="font-semibold tabular-nums">{r.a}</span>
                    <span className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.ok ? "bg-emerald-500/12 text-emerald-600" : "bg-amber-400/15 text-amber-600"}`}>
                      {r.ok ? <IconCheck /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                      {/* Shorter on a phone, where the row is narrow. */}
                      <span className="sm:hidden">{r.ok ? "Synced" : "Waiting"}</span>
                      <span className="hidden sm:inline">{r.s}</span>
                    </span>
                  </span>
                </div>
              ))}
              <p className="pt-1 text-center text-xs text-muted">The till keeps selling. Everything catches up when the signal returns.</p>
            </div>
          </Tile>

          <Tile icon={<IconTill />} title="Retail counter" body="A fast product grid built for a queue — search, scan, or tap, and take cash, EcoCash, or any tender you already use." />
          <Tile icon={<IconTable />} title="Full table service" body="Floor plan, kitchen display, gratuity — switch a branch to restaurant mode and every till there follows, automatically." />
          <Tile icon={<IconStore />} title="Multi-branch, one login" body="Run a retail shop and a restaurant under one account. Each branch keeps its own mode, staff, and stock." />
          <Tile icon={<IconReceipt />} title="ZIMRA-ready" body="Fiscalisation built against the real FDMS spec — turn it on when you're ready, not before." />
          <Tile icon={<IconUsers />} title="Staff & payroll" body="PIN-only till logins for cashiers, full dashboard access for managers, PAYE handled on the Premium plan." />

          <Tile icon={<IconPalette />} title="White-label" body="Your logo, your colours, your subdomain. Customers see your brand, not ours — Wivae is the engine underneath.">
            <div className="mt-5 flex gap-2" aria-hidden="true">
              {["#7c3aed", "#059669", "#e11d48", "#f59e0b", "#0ea5e9"].map((c) => (
                <span key={c} className="h-6 w-6 rounded-full ring-2 ring-surface" style={{ background: c }} />
              ))}
            </div>
          </Tile>

          <Tile className="sm:col-span-2" icon={<IconSparkles />} title="AI Analytics" body="Reorder suggestions, pricing flags, and dead-stock alerts — surfaced automatically from your own sales data.">
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium" aria-hidden="true">
              <span className="rounded-full bg-brand-500/10 px-3 py-1.5 text-brand-strong">↻ Reorder: Fresh Milk 1L</span>
              <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-amber-600">⚑ Margin looks low on Bread</span>
              <span className="rounded-full bg-hairline px-3 py-1.5 text-muted">Slow mover: Candles</span>
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

/**
 * Mirrors the real first-run flow (the "Get selling" checklist in the
 * dashboard), so the page promises nothing the product doesn't do.
 */
export function HowItWorks() {
  const steps = [
    { n: "1", t: "Tell us what you sell", b: "Pick your kind of business. We set up the till layout and sensible categories, and offer example products you can edit or delete." },
    { n: "2", t: "Open the till", b: "One click pairs this device and opens the till. Install it to your home screen and it works without a connection." },
    { n: "3", t: "Make your first sale", b: "Sign in with your 4-digit PIN, ring something up, and watch it land on your dashboard." },
  ];
  return (
    <section id="how" className="border-y border-hairline bg-surface px-6 py-24 transition-colors">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">How it works</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">From sign-up to first sale in minutes</h2>
        </div>
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="reveal relative rounded-3xl border border-hairline bg-canvas p-7">
              <span className="font-display text-7xl font-extrabold leading-none tracking-tighter text-brand-500/15">{s.n}</span>
              <h3 className="mt-3 font-display text-xl font-bold tracking-tight">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.b}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
