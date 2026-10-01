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

/** Ported from Home.tsx's FAQ + FaqItem, merged into one island since each
 * item's open/close state is small and independent — no need for six
 * separate hydration boundaries. */
export default function FaqAccordion() {
  return (
    <div className="mt-10 divide-y divide-hairline">
      {FAQS.map((f) => (
        <FaqItem key={f.q} q={f.q} a={f.a} />
      ))}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="font-medium">{q}</span>
        <span className={`shrink-0 text-muted transition-transform ${open ? "rotate-45" : ""}`}>
          <IconPlus />
        </span>
      </button>
      {open && <p className="mt-2 text-sm text-muted">{a}</p>}
    </div>
  );
}
