import { IconCheck } from "./Icons";
import type { PlanInfo, HardwareInfo } from "./types";
import { REGISTER_URL } from "../config";

/**
 * Ported from Home.tsx's Pricing, self-serve section only. Figures: BYOD
 * $19.99/mo, Standard $199.99 once off and Premium $249 once off (the tablet is
 * included outright — see the pricing-restore commit), each with the first
 * month included, then $5/mo maintenance from the second month (server:
 * domain/billing/maintenance.ts).
 *
 * Fully static (zero client JS) — deliberately, so a search engine or a
 * slow connection sees the actual prices in the initial HTML. The
 * quote-based Business/Enterprise section used to be part of this same
 * component, but it needs a modal (real interactivity), and Astro's
 * client:* directives only apply to a component invoked directly in an
 * .astro template — not one nested inside another framework component's
 * props. So that section now lives directly in index.astro as a sibling,
 * immediately after this component, with its own <EnquiryFlow client:idle />
 * hydration boundary. Splitting it out this way keeps this entire pricing
 * grid at zero JS while still letting the quote flow be interactive.
 */
export default function Pricing({
  plans,
  hardware,
}: {
  plans: Record<string, PlanInfo>;
  hardware: Record<string, HardwareInfo>;
}) {
  if (!plans || !hardware) {
    return (
      <section id="pricing" className="border-t border-hairline px-6 py-24 text-center transition-colors">
        <p className="text-sm text-muted">Pricing is being updated — check back shortly.</p>
      </section>
    );
  }

  // One figure for the intro line; the cards show each plan's own.
  const standardMaintenance = Object.values(plans).find((p) => p.maintenance)?.maintenance ?? 5;

  return (
    <section id="pricing" className="border-t border-hairline px-6 py-24 transition-colors">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Simple, honest Investment</h2>
          <p className="mt-3 text-muted">Standard and Premium include their tablet in a single once-off payment, with your first month included — then just ${standardMaintenance}/month to keep everything running.</p>
        </div>

        <div className="mx-auto mt-8 max-w-2xl rounded-xl border border-hairline bg-surface p-4 text-center text-sm text-muted transition-colors">
          <span className="font-medium text-ink">Not sure which one fits?</span> Each plan below is scoped to a
          real situation, not just a feature count — read the "Best for" line under the price before comparing
          the checklist.
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {Object.entries(plans).map(([key, p]) => (
            <div
              key={key}
              className={`relative rounded-2xl border p-7 transition-colors ${
                key === "standard"
                  ? "border-brand-500/50 bg-brand-50 shadow-[0_0_40px_-10px_rgba(124,58,237,0.2)]"
                  : "border-hairline bg-surface"
              }`}
            >
              {key === "standard" && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-lg font-bold">{p.label}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tabular-nums">${p.price}</span>
                <span className="text-sm text-muted">{p.recurring ? "/mo" : "once off payment"}</span>
              </div>
              {p.maintenance !== undefined && (
                <p className="mt-1 text-xs font-medium text-ink">First month included, then ${p.maintenance}/month</p>
              )}
              <p className="mt-1 text-xs text-muted">
                {p.branches === null ? "Unlimited branches" : `Up to ${p.branches} branch${p.branches === 1 ? "" : "es"}`}
              </p>
              <p className="mt-3 text-xs font-medium text-brand-600">Best for: {p.best_for}</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-brand-500"><IconCheck /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={REGISTER_URL}
                className={`mt-7 block rounded-xl py-3 text-center text-sm font-semibold transition-opacity hover:opacity-90 ${
                  key === "standard"
                    ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white"
                    : "border border-hairline"
                }`}
              >
                Start with {p.label}
              </a>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-5 max-w-2xl text-center text-xs text-muted">
          BYOD is billed monthly with no minimum term — cancel anytime. Standard and Premium are a once-off
          payment that includes your tablet and printer outright and your first month; after that there is a flat
          ${standardMaintenance} maintenance payment each month to keep your dashboard and tills running. Nothing is ever
          charged automatically: we remind you by email and text before it is due, and paying ahead earns free months —
          6 months for the price of 5, 12 months for the price of 10. If a payment is missed, your tills keep selling for
          two weeks before sync pauses.
        </p>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-hairline p-6 text-center transition-colors">
          <h3 className="font-display text-lg font-bold">Need hardware?</h3>
          <p className="mt-1 text-xs text-muted">
            Standard and Premium already include theirs. This is only for BYOD, or a Standard customer wanting
            the bigger 12" tablet without upgrading.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Object.entries(hardware).map(([key, h]) => (
              <div key={key} className="rounded-xl border border-hairline p-4 text-left">
                <div className="text-sm font-medium">{h.label}</div>
                <div className="mt-1 text-xl font-bold text-brand-500">${h.price} + 6 months warranty</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
