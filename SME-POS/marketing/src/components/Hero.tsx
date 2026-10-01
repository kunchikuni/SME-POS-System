import type { CSSProperties } from "react";
import { IconArrowRight, IconCheck } from "./Icons";
import DeviceScene from "./Devices";
import { REGISTER_URL } from "../config";

/** Staggers the entrance: each element sets its own delay through --d. */
const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/** The kinds of business sign-up sets up (server/src/domain/businessTypes.ts). */
const BUSINESS_TYPES = [
  "Shops", "Supermarkets", "Restaurants", "Bottle stores", "Pharmacies",
  "Clothing stores", "Butcheries", "Hardware", "Workshops", "Salons",
];

/**
 * The hero is deliberately dark whatever the page-wide theme toggle says:
 * device mockups read best against a dark stage, and it gives the page one
 * dramatic beat. Everything below it follows the toggle.
 *
 * Left: the promise and the call to action. Right: a laptop and a phone in 3D
 * (components/Devices.tsx) — the dashboard, and a till that is offline and still
 * selling, with two notes that tell the sync story.
 */
export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#0a0612] px-5 pb-20 pt-12 sm:px-6 sm:pt-20 lg:pb-24 lg:pt-24">
      {/* Glows are radial gradients, not blurred shapes: same look, but no
          expensive blur filter for a cheap phone to repaint while scrolling. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(42rem 36rem at 4% -6%, rgba(124,58,237,0.34), transparent 70%)," +
              "radial-gradient(36rem 30rem at 98% 14%, rgba(217,70,239,0.17), transparent 70%)," +
              "radial-gradient(24rem 18rem at 40% 100%, rgba(251,191,36,0.10), transparent 70%)",
          }}
        />
        <div className="hero-grid absolute inset-0" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-[1.02fr_1fr] lg:gap-8">
        <div className="text-center lg:text-left">
          <div className="rise mx-auto inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-violet-200 backdrop-blur lg:mx-0" style={delay(0)}>
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="ping-soft absolute inset-0 rounded-full bg-emerald-400" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-left">Built to keep selling through load-shedding and dropped signal</span>
          </div>

          <h1 className="rise mt-7 font-display text-[2.15rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-white text-balance sm:text-5xl lg:text-[3.1rem]" style={delay(0.08)}>
            The smart way to run your business.
            <span className="relative mt-1 block w-fit max-lg:mx-auto">
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">
                Online or off.
              </span>
              <svg aria-hidden="true" viewBox="0 0 300 14" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full text-accent">
                <path d="M2 9c35-8 62 6 98-1s64-6 98 0 70 4 100-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.9" />
              </svg>
            </span>
          </h1>

          <p className="rise mx-auto mt-8 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg lg:mx-0" style={delay(0.18)}>
            WivaePOS puts your till, stock, staff and reports in one place, across every branch and device. Sales keep
            ringing up when the power or the network drops, and sync the moment you're back — made for how Zimbabwean
            businesses really trade.
          </p>

          <div className="rise mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start" style={delay(0.28)}>
            <a
              href={REGISTER_URL}
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_34px_-8px_rgba(124,58,237,0.75)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-8px_rgba(124,58,237,0.9)]"
            >
              Start 7-day free trial
              <span className="transition-transform group-hover:translate-x-0.5"><IconArrowRight /></span>
            </a>
            <a
              href="#pricing"
              className="rounded-xl border border-white/15 bg-white/[0.03] px-7 py-3.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.08]"
            >
              See pricing
            </a>
          </div>

          <p className="rise mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-white/45 lg:justify-start" style={delay(0.36)}>
            <span className="flex items-center gap-1.5"><span className="text-emerald-400"><IconCheck /></span> 7-day free trial — $0 due today</span>
            <span className="flex items-center gap-1.5"><span className="text-emerald-400"><IconCheck /></span> No credit card</span>
            <span className="flex items-center gap-1.5"><span className="text-emerald-400"><IconCheck /></span> Cancel anytime</span>
          </p>
        </div>

        <DeviceScene />
      </div>

      <div className="rise mx-auto mt-20 max-w-4xl text-center lg:mt-24" style={delay(0.5)}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Set up for your kind of business</p>
        <ul className="mt-5 flex flex-wrap justify-center gap-2.5">
          {BUSINESS_TYPES.map((t) => (
            <li key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm text-white/70 transition-colors hover:border-violet-400/40 hover:text-white">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
