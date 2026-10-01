import { Link } from "react-router-dom";

interface Props {
  feature: string;
  plan?: string;
}

/**
 * Rendered by a gated page (Payroll, Fiscalisation, AI Insights) when its
 * data fetch comes back with { code: 'plan_upgrade_required' } from
 * requireFeature(). Replaces what used to be a silent empty-state render
 * (zero staff, zero runs, no explanation) or, before the /api routing fix,
 * a raw JSON 403 on a blank page.
 */
const FEATURES: Record<string, { title: string; blurb: string; availableOn: string }> = {
  payroll: {
    title: "HR & Payroll",
    blurb:
      "Run monthly payroll for your team with PAYE, AIDS levy, and NSSA worked out automatically, and payslips ready to share.",
    availableOn: "Premium",
  },
  fiscalisation: {
    title: "ZIMRA Fiscalisation",
    blurb:
      "Submit sales to ZIMRA automatically and print compliant receipts with the QR code and verification details on every sale.",
    availableOn: "Premium",
  },
  "ai insights": {
    title: "AI Insights",
    blurb:
      "Get automatic alerts on slow-moving stock, pricing opportunities, and reorder suggestions based on how your shop actually sells.",
    availableOn: "Standard and Premium",
  },
};

export default function UpgradeRequired({ feature, plan }: Props) {
  const info: { title: string; blurb: string; availableOn?: string } = FEATURES[feature.toLowerCase()] ?? {
    title: feature.replace(/\b\w/g, (c) => c.toUpperCase()),
    blurb: "This feature is available on a higher plan.",
  };

  const planLabel = plan
    ? plan.toLowerCase() === "byod"
      ? "BYOD"
      : plan.charAt(0).toUpperCase() + plan.slice(1)
    : "current";

  return (
    <div className="mx-auto mt-10 max-w-lg">
      <div className="rounded-xl border border-hairline bg-surface p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>

        <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">
          {info.title} isn't on your plan yet
        </h1>

        <p className="mt-2 text-sm text-muted">{info.blurb}</p>

        <p className="mt-4 text-sm text-muted">
          You're currently on the <span className="font-medium text-inherit">{planLabel}</span>{" "}
          plan.
          {info.availableOn && (
            <>
              {" "}This is included in <span className="font-medium text-inherit">{info.availableOn}</span>.
            </>
          )}{" "}
          Upgrade to unlock it — it takes a minute and applies right away.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <Link
            to="/settings/payments"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            View plans & upgrade
          </Link>
          <Link
            to="/dashboard"
            className="rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-medium hover:bg-canvas"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
