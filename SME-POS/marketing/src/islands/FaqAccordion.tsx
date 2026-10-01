import { useState } from "react";
import { IconPlus } from "../components/Icons";

const FAQS = [
  { q: "Does it really work without internet?", a: "Yes — sales, stock, and staff all live on the device first and sync when a connection returns. A dropped connection or load-shedding never blocks a sale." },
  { q: "What happens if the power or network drops mid-sale?", a: "Nothing is lost. The sale completes locally and queues for sync; nothing waits on the network to finish a transaction." },
  { q: "Can I switch between retail and restaurant mode?", a: "Yes, per branch. One tenant can run a retail shop and a restaurant as two branches, each with its own mode." },
  { q: "Is ZIMRA fiscalisation included?", a: "It's available as an add-on, built against ZIMRA's real FDMS spec. Turn it on when you're ready — it isn't forced on every plan." },
  { q: "Do I need to buy hardware from you?", a: "No. BYOD works with your own Android tablet and printer. Hardware bundles are optional, priced separately, and available on any plan." },
  { q: "Can I cancel anytime?", a: "BYOD is billed monthly with no lock-in — cancel anytime. Standard and Premium are a once-off payment that includes your first month, then a flat $5 maintenance payment each month. Nothing is charged automatically — we remind you by email and text before each payment is due, and paying ahead earns free months (6 months for the price of 5, 12 for the price of 10). If a payment is missed, your dashboard locks, your tills keep selling for two weeks, and then sync pauses (sales stay saved on the device); one $5 payment brings everything back." },
];

/** Each item's open/close state is small and independent — one island, not six. */
export default function FaqAccordion() {
  return (
    <div className="mt-12 space-y-3">
      {FAQS.map((f) => (
        <FaqItem key={f.q} q={f.q} a={f.a} />
      ))}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border bg-surface transition-colors ${open ? "border-brand-500/40" : "border-hairline"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
      >
        <span className="font-semibold">{q}</span>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-500 transition-transform duration-200 ${open ? "rotate-45" : ""}`}>
          <IconPlus />
        </span>
      </button>
      {open && <p className="px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6">{a}</p>}
    </div>
  );
}
