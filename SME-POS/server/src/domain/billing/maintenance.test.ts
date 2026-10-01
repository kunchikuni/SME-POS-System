import { describe, expect, it } from 'vitest';
import {
  BILLING_PERIOD_DAYS, PREPAY_OPTIONS, billedMonths, freeMonths, maintenanceFeeCents, monthsFromReference, nextPeriodEnd, paysMaintenance,
} from './maintenance.js';

const DAY = 86_400_000;
const now = new Date('2026-10-01T12:00:00.000Z');
const days = (n: number) => new Date(now.getTime() + n * DAY);

describe('maintenance fee', () => {
  it('is $7 a month on Standard and $12 on Premium — Premium carries more upkeep', () => {
    expect(maintenanceFeeCents('standard')).toBe(700);
    expect(maintenanceFeeCents('premium')).toBe(1200);
    expect(maintenanceFeeCents('pro')).toBe(1200); // the old name for Premium
  });

  it('is nothing on BYOD, a trial, or a plan nobody has heard of', () => {
    for (const plan of ['byod', 'trial', 'enterprise', '', 'constructor', 'toString', '__proto__']) {
      expect(maintenanceFeeCents(plan), plan).toBeNull();
      expect(paysMaintenance(plan), plan).toBe(false);
    }
  });

  it('applies to Standard and Premium, not BYOD or a trial', () => {
    expect(paysMaintenance('standard')).toBe(true);
    expect(paysMaintenance('premium')).toBe(true);
    expect(paysMaintenance('byod')).toBe(false);
    expect(paysMaintenance('trial')).toBe(false);
  });
});

describe('nextPeriodEnd', () => {
  it('starts a first payment from today', () => {
    expect(nextPeriodEnd(now)).toEqual(days(BILLING_PERIOD_DAYS));
    expect(nextPeriodEnd(now, null)).toEqual(days(30));
  });

  it('continues from the end of the period already paid for, so paying early wastes nothing', () => {
    expect(nextPeriodEnd(now, days(12))).toEqual(days(42));
  });

  it('starts from today when the paid period has already run out — late payers are not back-billed', () => {
    expect(nextPeriodEnd(now, days(-50))).toEqual(days(30));
    expect(nextPeriodEnd(now, now)).toEqual(days(30));
  });
});

describe('paying several months at once', () => {
  it('buys that many 30-day periods from the end of what is already paid', () => {
    expect(nextPeriodEnd(now, days(10), 3)).toEqual(days(100));
    expect(nextPeriodEnd(now, null, 12)).toEqual(days(360));
  });

  it('starts from today when the paid period has run out', () => {
    expect(nextPeriodEnd(now, days(-20), 6)).toEqual(days(180));
  });

  it('reads the month count back from a payment reference', () => {
    expect(monthsFromReference('maint_abc_1790845000000_m6')).toBe(6);
    expect(monthsFromReference('sub_abc_1790845000000_m12')).toBe(12);
  });

  it('treats a reference with no count (made before this existed) or a silly one as a single month', () => {
    expect(monthsFromReference('sub_abc_1790845000000')).toBe(1);
    expect(monthsFromReference(null)).toBe(1);
    expect(monthsFromReference('maint_abc_1790845000000_m0')).toBe(1);
    expect(monthsFromReference('maint_abc_1790845000000_m99')).toBe(1);
  });
});

describe('free months for paying ahead', () => {
  it('pay for 6 get 1 free, pay for 12 get 2 free; nothing off the shorter ones', () => {
    expect(PREPAY_OPTIONS.map((m) => [m, freeMonths(m), billedMonths(m)])).toEqual([
      [1, 0, 1], [3, 0, 3], [6, 1, 5], [12, 2, 10],
    ]);
  });

  it('prices Standard at $35 for six months and $70 for twelve, and Premium at $60 and $120', () => {
    expect(maintenanceFeeCents('standard')! * billedMonths(6)).toBe(3500);
    expect(maintenanceFeeCents('standard')! * billedMonths(12)).toBe(7000);
    expect(maintenanceFeeCents('premium')! * billedMonths(6)).toBe(6000);
    expect(maintenanceFeeCents('premium')! * billedMonths(12)).toBe(12000);
  });

  it('gives no free month on a number of months it does not offer', () => {
    expect(freeMonths(7)).toBe(0);
    expect(freeMonths(2)).toBe(0);
  });
});
