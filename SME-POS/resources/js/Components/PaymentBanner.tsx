import { useState } from "react";
import { Link } from "react-router-dom";
import { paymentNotice, PAYMENTS_PATH, type AccessInfo, type PaymentNotice } from "../lib/billing.js";

export const NOTICE_TONE: Record<PaymentNotice["tone"], string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
};

const DISMISSED_KEY = "wivae.paymentNotice.dismissed";

/** Per-tab memory only — a convenience, so every read and write tolerates storage being unavailable. */
const readDismissed = () => {
  try { return sessionStorage.getItem(DISMISSED_KEY); } catch { return null; }
};
const writeDismissed = (title: string) => {
  try { sessionStorage.setItem(DISMISSED_KEY, title); } catch { /* not remembered; shows again next load */ }
};

/**
 * The strip across the top of the dashboard about the business's payment
 * standing: a trial or maintenance countdown as the end nears, or — once
 * blocked — why, and the button to fix it. A countdown can be dismissed for the
 * session (it comes back, with a smaller number, tomorrow); a block cannot.
 */
export default function PaymentBanner({ access }: { access: AccessInfo | undefined }) {
  const notice = paymentNotice(access);
  // Keyed by title, which carries the day count: dismissing "5 days left" does not hide "4 days left".
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!notice) return null;
  const blocked = notice.tone === "danger";
  if (!blocked && dismissed === notice.title) return null;

  return (
    <div
      role={blocked ? "alert" : "status"}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 text-sm lg:px-6 ${NOTICE_TONE[notice.tone]}`}
    >
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{notice.title}.</span> {notice.body}
      </p>
      <div className="flex items-center gap-3">
        <Link
          to={PAYMENTS_PATH}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
        >
          {notice.cta}
        </Link>
        {!blocked && (
          <button
            onClick={() => { writeDismissed(notice.title); setDismissed(notice.title); }}
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
