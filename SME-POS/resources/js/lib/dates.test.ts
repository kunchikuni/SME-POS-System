import { describe, expect, it } from "vitest";
import {
  addDays, daysInMonth, dueDay, dueState, firstWeekdayMonFirst, friendlyDate, isoDate, isIsoDate,
  parseIso, relativeDay, shiftMonth, shortDate,
} from "./dates.js";

describe("calendar arithmetic", () => {
  it("builds and parses ISO days (0-based months)", () => {
    expect(isoDate(2026, 9, 5)).toBe("2026-10-05");
    expect(isoDate(2026, 0, 1)).toBe("2026-01-01");
    expect(parseIso("2026-10-05")).toEqual({ year: 2026, month0: 9, day: 5 });
    expect(isIsoDate("2026-10-05")).toBe(true);
    expect(isIsoDate("2026-10-5")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-10-05", 0)).toBe("2026-10-05");
    expect(addDays("2026-10-05", -40)).toBe("2026-08-26");
  });

  it("knows month lengths, including February", () => {
    expect(daysInMonth(2026, 8)).toBe(30); // September
    expect(daysInMonth(2026, 9)).toBe(31); // October
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2100, 1)).toBe(28); // century, not a leap year
  });

  it("puts the 1st on the right column of a Monday-first grid", () => {
    expect(firstWeekdayMonFirst(2026, 9)).toBe(3); // 1 Oct 2026 is a Thursday
    expect(firstWeekdayMonFirst(2026, 8)).toBe(1); // 1 Sep 2026 is a Tuesday
    expect(firstWeekdayMonFirst(2026, 1)).toBe(6); // 1 Feb 2026 is a Sunday → last column
    expect(firstWeekdayMonFirst(2026, 5)).toBe(0); // 1 Jun 2026 is a Monday → first column
  });

  it("shifts months with year rollover in both directions", () => {
    expect(shiftMonth(2026, 9, 1)).toEqual({ year: 2026, month0: 10 });
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
    expect(shiftMonth(2026, 5, -18)).toEqual({ year: 2024, month0: 11 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month0: 5 });
  });
});

describe("labels", () => {
  it("formats short and friendly dates", () => {
    expect(shortDate("2026-10-05")).toBe("5 Oct 2026");
    expect(friendlyDate("2026-10-05", "2026-09-30")).toBe("Mon, 5 Oct"); // same year drops the year
    expect(friendlyDate("2027-01-04", "2026-09-30")).toBe("Mon, 4 Jan 2027");
  });

  it("describes a day relative to today", () => {
    const today = "2026-09-30";
    expect(relativeDay("2026-09-30", today)).toBe("Today");
    expect(relativeDay("2026-10-01", today)).toBe("Tomorrow");
    expect(relativeDay("2026-09-29", today)).toBe("Yesterday");
    expect(relativeDay("2026-10-04", today)).toBe("In 4 days");
    expect(relativeDay("2026-09-20", today)).toBe("10 days overdue");
    expect(relativeDay("2026-10-02", "2026-09-30")).toBe("In 2 days");
  });
});

describe("due dates", () => {
  it("reads the calendar day out of a stored due timestamp", () => {
    expect(dueDay("2026-10-05T12:00:00.000Z")).toBe("2026-10-05");
    expect(dueDay(null)).toBeNull();
    expect(dueDay(undefined)).toBeNull();
    expect(dueDay("")).toBeNull();
  });

  it("classifies urgency, with 'soon' meaning the next 3 days", () => {
    const today = "2026-09-30";
    expect(dueState(null, today)).toBe("none");
    expect(dueState("2026-09-29", today)).toBe("overdue");
    expect(dueState("2026-09-30", today)).toBe("today");
    expect(dueState("2026-10-01", today)).toBe("soon");
    expect(dueState("2026-10-03", today)).toBe("soon");  // today + 3
    expect(dueState("2026-10-04", today)).toBe("later"); // today + 4
  });

  it("compares correctly across a month boundary (string order = date order)", () => {
    expect(dueState("2026-10-01", "2026-09-30")).toBe("soon");
    expect(dueState("2026-09-30", "2026-10-01")).toBe("overdue");
    expect(dueState("2027-01-01", "2026-12-31")).toBe("soon");
  });
});
