import { afterEach, describe, expect, it, vi } from "vitest";
import { coveredUntil, isFeatureLocked, paymentNotice, type AccessInfo } from "./billing.js";
import { api, ApiError, PAYMENT_REQUIRED_EVENT } from "./api.js";

const DAY = 86_400_000;
const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const access = (over: Partial<AccessInfo> = {}): AccessInfo => ({
  blocked: false,
  state: "active",
  graceEndsAt: null,
  kind: "maintenance",
  endsAt: iso(20),
  daysLeft: 20,
  maintenanceFeeCents: 700,
  features: { aiInsights: true, payroll: false, fiscalisation: false },
  ...over,
});

describe("paymentNotice — the dashboard banner", () => {
  it("says nothing when there is nothing to say", () => {
    expect(paymentNotice(undefined)).toBeNull();
    expect(paymentNotice(null)).toBeNull();
    expect(paymentNotice(access())).toBeNull(); // paid, 20 days left
    expect(paymentNotice(access({ endsAt: null, daysLeft: null }))).toBeNull(); // no end date on record
  });

  it("counts down a trial in its last week, and escalates in the last three days", () => {
    const early = paymentNotice(access({ kind: "trial", daysLeft: 6, endsAt: iso(6), maintenanceFeeCents: null }))!;
    expect(early).toMatchObject({ tone: "info", title: "Free trial: 6 days left", cta: "Choose a plan" });
    expect(paymentNotice(access({ kind: "trial", daysLeft: 8, endsAt: iso(8) }))).toBeNull();
    expect(paymentNotice(access({ kind: "trial", daysLeft: 3, endsAt: iso(3) }))!.tone).toBe("warn");
    expect(paymentNotice(access({ kind: "trial", daysLeft: 1, endsAt: iso(1) }))!.title).toBe("Free trial: 1 day left");
  });

  it("reminds a Standard/Premium business of its fee as the month runs out", () => {
    expect(paymentNotice(access({ daysLeft: 6, endsAt: iso(6) }))).toBeNull();
    const n = paymentNotice(access({ daysLeft: 5, endsAt: iso(5) }))!;
    expect(n).toMatchObject({ tone: "warn", title: "Monthly maintenance is due in 5 days", cta: "Pay now" });
    expect(n.body).toContain("$7");
  });

  it("reminds a BYOD business that its month is ending, without mentioning maintenance", () => {
    const n = paymentNotice(access({ kind: "monthly", maintenanceFeeCents: null, daysLeft: 2, endsAt: iso(2) }))!;
    expect(n.title).toBe("Your monthly plan ends in 2 days");
    expect(`${n.title} ${n.body}`).not.toMatch(/maintenance/i);
  });

  it("blocks an ended trial: pick a plan, data is safe", () => {
    const n = paymentNotice(access({ blocked: true, kind: "trial", state: "lapsed", daysLeft: null, maintenanceFeeCents: null }))!;
    expect(n).toMatchObject({ tone: "danger", title: "Your free trial has ended", cta: "Choose a plan" });
    expect(n.body).toContain("Your data is safe");
  });

  it("blocks an overdue maintenance month and names the fee", () => {
    const n = paymentNotice(access({ blocked: true, state: "lapsed", daysLeft: null }))!;
    expect(n).toMatchObject({ tone: "danger", title: "Monthly maintenance is overdue", cta: "Pay now" });
    expect(n.body).toContain("Pay $7");
  });

  it("tells the owner their tills are still selling during the grace period — and when they stop", () => {
    const n = paymentNotice(access({ blocked: true, state: "grace", graceEndsAt: iso(2), daysLeft: null }))!;
    expect(n.body).toContain("Your tills keep selling until");
  });

  it("tells the owner their sales are safe once the tills have paused", () => {
    const n = paymentNotice(access({ blocked: true, state: "lapsed", daysLeft: null }))!;
    expect(n.body).toContain("sales stay saved on each device");
    expect(n.body).toContain("sync once you pay");
  });

  it("does not say 'maintenance' to a blocked BYOD business or one with no end date", () => {
    const byod = paymentNotice(access({ blocked: true, kind: "monthly", state: "lapsed", maintenanceFeeCents: null, daysLeft: null }))!;
    expect(byod.title).toBe("Your subscription has ended");
    const noDate = paymentNotice(access({ blocked: true, state: "lapsed", endsAt: null, daysLeft: null }))!;
    expect(noDate.title).toBe("Your subscription has ended");
  });
});

describe("isFeatureLocked — the plan-gated menu items", () => {
  it("locks what the plan lacks and leaves the rest open", () => {
    const standard = access();
    expect(isFeatureLocked(standard, "aiInsights")).toBe(false);
    expect(isFeatureLocked(standard, "payroll")).toBe(true);
    expect(isFeatureLocked(standard, "fiscalisation")).toBe(true);
  });

  it("locks nothing for an ordinary item, or when the server sent no access info", () => {
    expect(isFeatureLocked(access(), undefined)).toBe(false);
    expect(isFeatureLocked(undefined, "payroll")).toBe(false);
  });
});

describe("a 402 from the server", () => {
  const events: unknown[] = [];
  const onEvent = (e: Event) => events.push((e as CustomEvent).detail);

  const respondWith = (status: number, body: unknown) => {
    events.length = 0;
    const target = new EventTarget();
    target.addEventListener(PAYMENT_REQUIRED_EVENT, onEvent);
    vi.stubGlobal("window", target);
    vi.stubGlobal("fetch", async () => ({
      ok: false, status, statusText: "x", json: async () => body,
    }));
  };
  afterEach(() => vi.unstubAllGlobals());

  it("raises the payment-required event, and still rejects so the page's own handling runs", async () => {
    respondWith(402, { message: "Your trial has ended.", code: "subscription_required", reason: "trial_ended" });
    await expect(api.aiInsights.get()).rejects.toBeInstanceOf(ApiError);
    expect(events).toEqual([{ message: "Your trial has ended." }]);
  });

  it("is not raised for a plan gate (403) or an unrelated 402", async () => {
    respondWith(403, { code: "plan_upgrade_required", message: "no" });
    await expect(api.aiInsights.get()).rejects.toBeInstanceOf(ApiError);
    respondWith(402, { message: "something else" });
    await expect(api.aiInsights.get()).rejects.toBeInstanceOf(ApiError);
    expect(events).toEqual([]);
  });
});

describe("coveredUntil — what paying N months buys", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  const plus = (days: number) => new Date(now.getTime() + days * DAY).toISOString();

  it("adds the months to what is already paid for, so paying early wastes nothing", () => {
    expect(coveredUntil(plus(10), 3, now).toISOString()).toBe(plus(100));
  });

  it("starts from today when the paid period has run out, or there is none", () => {
    expect(coveredUntil(plus(-20), 1, now).toISOString()).toBe(plus(30));
    expect(coveredUntil(null, 6, now).toISOString()).toBe(plus(180));
  });
});
