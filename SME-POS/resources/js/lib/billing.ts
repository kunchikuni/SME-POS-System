/**
 * What the dashboard says about the business's payment standing.
 *
 * The server decides (accessSummary in server/src/domain/billing); this turns
 * that into the words and tone of the banner, so the wording lives in one place
 * and can be tested without rendering anything.
 */

/** Mirrors the server's AccessSummary, as it arrives over JSON from /me and /billing/payments. */
export interface AccessInfo {
  /** The dashboard is shut: no trial running and no paid period in force. */
  blocked: boolean;
  /** For the till: active · grace (tills still sync) · lapsed (tills paused). */
  state: "active" | "grace" | "lapsed";
  graceEndsAt: string | null;
  /** What runs out: the free trial, BYOD's monthly period, or Standard/Premium's maintenance month. */
  kind: "trial" | "monthly" | "maintenance";
  endsAt: string | null;
  /** Whole days left while access is open; null once ended or with no end date. */
  daysLeft: number | null;
  maintenanceFeeCents: number | null;
  features: { aiInsights: boolean; payroll: boolean; fiscalisation: boolean };
}

export const PAYMENTS_PATH = "/settings/payments";
/** Where a blocked business is sent. The query lets the page open on the explanation. */
export const BLOCKED_PAYMENTS_PATH = `${PAYMENTS_PATH}?blocked=1`;

export const isPaymentsPath = (pathname: string) => pathname.startsWith(PAYMENTS_PATH);

export const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

/** "12 Oct" — no year, the banner is always about the next few days. */
export const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** How soon before the end a countdown starts to show. */
export const TRIAL_NOTICE_DAYS = 7;
export const RENEWAL_NOTICE_DAYS = 5;

export interface PaymentNotice {
  /** info = a countdown · warn = due soon · danger = blocked */
  tone: "info" | "warn" | "danger";
  title: string;
  body: string;
  /** What the button that goes to Payments says. */
  cta: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The banner for a business that is blocked: why, what to do, and what its tills are doing meanwhile. */
function blockedNotice(a: AccessInfo): PaymentNotice {
  let title: string;
  let action: string;
  if (a.kind === "trial") {
    title = "Your free trial has ended";
    action = "Choose a plan to keep using Wivae. Your data is safe.";
  } else if (a.kind === "maintenance" && a.endsAt) {
    const fee = a.maintenanceFeeCents ? money(a.maintenanceFeeCents) : "the monthly maintenance fee";
    title = "Monthly maintenance is overdue";
    action = `Pay ${fee} to reopen your dashboard. Your data is safe.`;
  } else {
    title = "Your subscription has ended";
    action = "Renew to reopen your dashboard. Your data is safe.";
  }

  let tills = "";
  if (a.state === "grace" && a.graceEndsAt) {
    tills = ` Your tills keep selling until ${shortDay(a.graceEndsAt)}.`;
  } else if (a.state === "lapsed") {
    tills = " Your tills have paused — sales stay saved on each device and sync once you pay.";
  }
  return { tone: "danger", title, body: action + tills, cta: a.kind === "trial" ? "Choose a plan" : "Pay now" };
}

/**
 * The banner to show, if any: nothing while the business is comfortably paid
 * up, a countdown as its trial or paid month nears its end, and a block notice
 * once it has ended.
 */
export function paymentNotice(access: AccessInfo | null | undefined): PaymentNotice | null {
  if (!access) return null;
  if (access.blocked) return blockedNotice(access);

  const left = access.daysLeft;
  if (left === null || !access.endsAt) return null;
  const when = shortDay(access.endsAt);

  if (access.kind === "trial" && left <= TRIAL_NOTICE_DAYS) {
    return {
      tone: left <= 3 ? "warn" : "info",
      title: `Free trial: ${plural(left, "day")} left`,
      body: `It ends on ${when}. Choose a plan any time to keep going.`,
      cta: "Choose a plan",
    };
  }
  if (access.kind === "maintenance" && left <= RENEWAL_NOTICE_DAYS) {
    const fee = access.maintenanceFeeCents ? money(access.maintenanceFeeCents) : "the monthly maintenance fee";
    return {
      tone: "warn",
      title: `Monthly maintenance is due in ${plural(left, "day")}`,
      body: `Pay ${fee} before ${when} to keep your dashboard and tills running.`,
      cta: "Pay now",
    };
  }
  if (access.kind === "monthly" && left <= RENEWAL_NOTICE_DAYS) {
    return {
      tone: "warn",
      title: `Your monthly plan ends in ${plural(left, "day")}`,
      body: `Pay for next month before ${when} to stay connected.`,
      cta: "Pay now",
    };
  }
  return null;
}

/** Which of the plan-gated menu items the plan does not include. */
export type GatedFeature = keyof AccessInfo["features"];

export function isFeatureLocked(access: AccessInfo | null | undefined, feature: GatedFeature | undefined): boolean {
  // No access info (an older server) means no locks rather than a menu full of them.
  if (!access || !feature) return false;
  return !access.features[feature];
}

/**
 * Until when paying `months` months gets a business covered — the same sum the
 * server does (server/src/domain/billing/maintenance.ts nextPeriodEnd): from
 * the end of what is already paid if that is still ahead, otherwise from today.
 */
export function coveredUntil(paidThrough: string | null | undefined, months: number, now: Date = new Date()): Date {
  const paid = paidThrough ? new Date(paidThrough) : null;
  const start = paid && paid > now ? paid : now;
  return new Date(start.getTime() + months * 30 * 86_400_000);
}
