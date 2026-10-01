import { useState, type ReactNode, type FormEvent } from "react";
import { IconLaptop, IconBuilding, IconCheck } from "../components/Icons";
import type { BusinessTierInfo } from "../components/types";
import { API_URL } from "../config";

/**
 * Ported from Home.tsx's TierCard + EnquiryModal, merged into one island
 * (Pricing.tsx passes this whole thing in as a slot — see its docblock).
 *
 * Two real bugs fixed while porting, both worth knowing about since they
 * mean this form had never actually worked:
 *
 * 1. Wrong endpoint. The original posted to "/enquire" — stale from before
 *    this session's earlier work moved every JSON route under "/api" (see
 *    server/src/index.ts's docblock on the SPA/API URL collision fix). The
 *    real route is POST /api/enquire (routes/enquiries.ts).
 * 2. Field name mismatch. The form sent `business_name` (snake_case) but
 *    the server's Zod schema requires `businessName` (camelCase) — Zod
 *    treats a missing required field as a validation error, so EVERY
 *    submission of this form would have 422'd before a human ever saw it,
 *    with the submitter shown a generic failure and no clear reason why.
 *    Also: `interested_in` (business/enterprise) was sent but the Enquiry
 *    table has no column for it, so it was silently dropped either way —
 *    now folded into the message text instead, since that's free text and
 *    actually gets read by a human.
 */
export default function EnquiryFlow({
  businessTier,
  enterpriseTier,
}: {
  businessTier: BusinessTierInfo;
  enterpriseTier: BusinessTierInfo;
}) {
  const [enquiryFor, setEnquiryFor] = useState<"business" | "enterprise" | null>(null);

  return (
    <>
      <TierCard
        tier={businessTier}
        iconBg="bg-gradient-to-br from-orange-500 to-amber-500"
        icon={<IconLaptop />}
        ctaLabel="Submit Inquiry for Quote"
        onClick={() => setEnquiryFor("business")}
      />
      <TierCard
        tier={enterpriseTier}
        iconBg="bg-gradient-to-br from-violet-500 to-indigo-600"
        icon={<IconBuilding />}
        ctaLabel="Register your interest"
        onClick={() => setEnquiryFor("enterprise")}
        comingSoon
      />
      {enquiryFor && <EnquiryModal tier={enquiryFor} onClose={() => setEnquiryFor(null)} />}
    </>
  );
}

function TierCard({
  tier, iconBg, icon, ctaLabel, onClick, comingSoon,
}: {
  tier: BusinessTierInfo; iconBg: string; icon: ReactNode; ctaLabel: string;
  onClick: () => void; comingSoon?: boolean;
}) {
  return (
    <div className="relative rounded-3xl border border-hairline bg-surface p-7 transition-colors">
      {comingSoon && (
        <span className="absolute right-6 top-6 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Coming soon
        </span>
      )}
      <div className="flex items-start gap-4">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white ${iconBg}`}>{icon}</div>
        <div>
          <h4 className="font-display text-lg font-bold">{tier.label}</h4>
          <p className="mt-1 text-sm text-muted">{tier.description}</p>
        </div>
      </div>
      <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="mt-0.5 text-brand-500"><IconCheck /></span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onClick}
        className="mt-7 inline-flex items-center gap-2 rounded-xl border border-hairline px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
      >
        {ctaLabel}
        <span aria-hidden>→</span>
      </button>
      {comingSoon && (
        <p className="mt-2 text-xs text-muted">
          Not available yet — this registers your interest so we can reach out when it's ready.
        </p>
      )}
    </div>
  );
}

function EnquiryModal({ tier, onClose }: { tier: "business" | "enterprise"; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [formData, setFormData] = useState({ name: "", businessName: "", email: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      const tierLabel = tier === "enterprise" ? "Enterprise" : "Business";
      const res = await fetch(`${API_URL}/enquire`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: formData.name,
          businessName: formData.businessName,
          email: formData.email,
          phone: formData.phone || null,
          // No dedicated column for which tier — folded into the message
          // text (free text, actually read by a human) rather than silently
          // dropped like the original form's `interested_in` field was.
          message: `[Interested in: ${tierLabel}] ${formData.message}`.trim(),
        }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const j = await res.json().catch(() => ({} as any));
        if (j?.errors) setFieldErrors(j.errors);
      }
    } catch {
      /* network error — silent, matches original behavior */
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-6 shadow-xl transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">
            {sent ? "Thanks — got it" : `Enquire about ${tier === "enterprise" ? "Enterprise" : "Business"}`}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>

        {sent ? (
          <p className="mt-4 text-sm text-muted">
            {tier === "enterprise"
              ? "We've got your details and will reach out when Enterprise is ready — no commitment, just an early heads-up."
              : "We've received your details and will be in touch shortly to put together a quote."}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <Field label="Your name" error={fieldErrors.name}>
              <input
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>
            <Field label="Business name" error={fieldErrors.businessName}>
              <input
                value={formData.businessName}
                onChange={(e) => setFormData((f) => ({ ...f, businessName: e.target.value }))}
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>
            <Field label="Email" error={fieldErrors.email}>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                value={formData.phone}
                onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>
            <Field label="What are you looking for? (optional)">
              <textarea
                rows={3}
                value={formData.message}
                onChange={(e) => setFormData((f) => ({ ...f, message: e.target.value }))}
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Sending…" : "Send enquiry"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
