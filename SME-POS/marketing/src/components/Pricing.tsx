import { IconCheck } from "./Icons";
import type { PlanInfo, HardwareInfo } from "./types";
import { REGISTER_URL } from "../config";

/**
 * Self-serve pricing. Figures: BYOD $19.99/mo, Standard $199.99 once off,
 * Premium $249 once off — once off because the tablet is included outright
 * (see the pricing-restore commit) — each with the first month included, then
 * $5/mo maintenance from the second month (server: domain/billing/maintenance.ts).
 *
 * Fully static (zero client JS) — deliberately, so a search engine or a
 * slow connection sees the actual prices in the initial HTML. The
 * quote-based Business/Enterprise section needs a modal (real interactivity),
 * and Astro's client:* directives only apply to a component invoked directly
 * in an .astro template — not one nested inside another framework component's
 * props. So that section lives in index.astro as a sibling, right after this
 * component, with its own <EnquiryFlow client:idle /> hydration boundary.
 * Splitting it out keeps this whole grid at zero JS.
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
      <section id="pricing" className="px-6 py-24 text-center transition-colors">
        <p className="text-sm text-muted">Pricing is being updated — check back shortly.</p>
      </section>
    );
  }

  // One figure for the intro line; the cards show each plan's own.
  const standardMaintenance = Object.values(plans).find((p) => p.maintenance)?.maintenance ?? 5;

  return (
    <section id="pricing" className="px-6 py-24 transition-colors">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Pricing</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Simple, honest investment</h2>
          <p className="mt-4 text-base leading-relaxed text-muted">Standard and Premium include their tablet in a single once-off payment, with your first month included — then just ${standardMaintenance}/month to keep everything running.</p>
        </div>

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-hairline bg-surface px-5 py-4 text-center text-sm text-muted transition-colors">
          <span className="font-semibold text-ink">Not sure which one fits?</span> Each plan below is scoped to a
          real situation, not just a feature count — read the "Best for" line under the price before comparing
          the checklist.
        </div>

        <div className="mt-12 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          {Object.entries(plans).map(([key, p]) => {
            const featured = key === "standard";
            return (
              // The featured plan gets a 1px gradient border by wrapping it in a gradient.
              <div key={key} className={`reveal relative rounded-[1.75rem] ${featured ? "bg-gradient-to-b from-violet-500 via-fuchsia-500/60 to-indigo-500 p-px shadow-[0_30px_70px_-30px_rgba(124,58,237,0.6)] lg:-my-3" : ""}`}>
                {featured && (
                  <span className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[#2a1a00] shadow-lg">
                    Most popular
                  </span>
                )}
                <div className={`flex h-full flex-col rounded-[1.7rem] p-7 transition-colors ${featured ? "bg-surface lg:py-10" : "border border-hairline bg-surface"}`}>
                  <h3 className="font-display text-xl font-bold tracking-tight">{p.label}</h3>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="font-display text-5xl font-extrabold tracking-tight tabular-nums">${p.price}</span>
                    <span className="text-sm text-muted">{p.recurring ? "/mo" : "once off payment"}</span>
                  </div>
                  {p.maintenance !== undefined && (
                    <p className="mt-1.5 text-xs font-medium text-ink">
                      First month included, then ${p.maintenance}/month
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-muted">
                    {p.branches === null ? "Unlimited branches" : `Up to ${p.branches} branch${p.branches === 1 ? "" : "es"}`}
                  </p>
                  <p className="mt-4 rounded-xl bg-brand-500/[0.07] px-3.5 py-2.5 text-xs font-medium leading-relaxed text-brand-strong">
                    Best for: {p.best_for}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/12 text-brand-500"><IconCheck /></span>
                        <span className="leading-relaxed">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={REGISTER_URL}
                    className={`mt-8 block rounded-xl py-3.5 text-center text-sm font-bold transition-all hover:-translate-y-0.5 ${
                      featured
                        ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-[0_10px_28px_-8px_rgba(124,58,237,0.75)]"
                        : "border border-hairline hover:border-brand-500/50 hover:bg-brand-500/[0.06]"
                    }`}
                  >
                    Start with {p.label}
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted">
          BYOD is billed monthly with no minimum term — cancel anytime. Standard and Premium are a once-off
          payment that includes your tablet and printer outright and your first month; after that there is a flat
          ${standardMaintenance} maintenance payment each month to keep your dashboard and tills running. Nothing is ever
          charged automatically: we remind you by email and text before it is due, and paying ahead earns free months —
          6 months for the price of 5, 12 months for the price of 10. If a payment is missed, your tills keep selling for
          two weeks before sync pauses.
        </p>

        <div className="reveal mx-auto mt-12 max-w-3xl rounded-3xl border border-hairline bg-surface p-7 text-center transition-colors">
          <h3 className="font-display text-xl font-bold tracking-tight">Need hardware?</h3>
          <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-muted">
            Standard and Premium already include theirs. This is only for BYOD, or a Standard customer wanting
            the bigger 12" tablet without upgrading.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Object.entries(hardware).map(([key, h]) => (
              <div key={key} className="rounded-2xl border border-hairline bg-canvas p-5 text-left">
                <div className="text-sm font-semibold">{h.label}</div>
                <div className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-brand-500">${h.price} <span className="font-sans text-xs font-medium text-muted">+ 6 months warranty</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
