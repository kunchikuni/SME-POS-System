/**
 * Calendar-date helpers for the dashboard. Dates are plain "YYYY-MM-DD"
 * strings throughout (a due date or a sales day is a calendar day, not an
 * instant), and all arithmetic is done in UTC so a browser's timezone can
 * never shift a day.
 */

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** (2026, 9, 5) → "2026-10-05" — month is 0-based like Date. */
export function isoDate(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

export function parseIso(iso: string): { year: number; month0: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month0: m - 1, day: d };
}

export function isIsoDate(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** The local calendar date on THIS device (used only when the server hasn't told us "today"). */
export function deviceToday(): string {
  const d = new Date();
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(iso: string, n: number): string {
  const { year, month0, day } = parseIso(iso);
  const d = new Date(Date.UTC(year, month0, day + n));
  return isoDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Weekday of the 1st, with Monday = 0 … Sunday = 6. */
export function firstWeekdayMonFirst(year: number, month0: number): number {
  return (new Date(Date.UTC(year, month0, 1)).getUTCDay() + 6) % 7;
}

/** Shift a {year, month0} by whole months (handles year rollover). */
export function shiftMonth(year: number, month0: number, by: number): { year: number; month0: number } {
  const total = year * 12 + month0 + by;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAYS_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "5 Oct 2026" */
export function shortDate(iso: string): string {
  const { year, month0, day } = parseIso(iso);
  return `${day} ${MONTH_NAMES[month0].slice(0, 3)} ${year}`;
}

/** "Mon, 5 Oct" — this year's dates drop the year. */
export function friendlyDate(iso: string, today: string): string {
  const { year, month0, day } = parseIso(iso);
  const wd = new Date(Date.UTC(year, month0, day)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const base = `${wd}, ${day} ${MONTH_NAMES[month0].slice(0, 3)}`;
  return year === parseIso(today).year ? base : `${base} ${year}`;
}

/** The calendar day a stored due date (an ISO timestamp) falls on. Due dates are saved at noon UTC, so this is timezone-proof. */
export function dueDay(dueAt: string | null | undefined): string | null {
  return dueAt ? dueAt.slice(0, 10) : null;
}

export type DueState = "overdue" | "today" | "soon" | "later" | "none";

/** How urgent a due day is relative to today. "soon" = within the next 3 days. */
export function dueState(day: string | null, today: string): DueState {
  if (!day) return "none";
  if (day < today) return "overdue";
  if (day === today) return "today";
  return day <= addDays(today, 3) ? "soon" : "later";
}

/** "Yesterday", "Today", "Tomorrow", "In 3 days", "5 days overdue" … */
export function relativeDay(day: string, today: string): string {
  const { year: y1, month0: m1, day: d1 } = parseIso(day);
  const { year: y2, month0: m2, day: d2 } = parseIso(today);
  const diff = Math.round((Date.UTC(y1, m1, d1) - Date.UTC(y2, m2, d2)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 0 ? `In ${diff} days` : `${-diff} days overdue`;
}
