/**
 * "Which day did this happen on" in the business's own timezone — shared by
 * the Orders and Transactions day views.
 *
 * A fixed UTC offset: Zimbabwe (CAT) is UTC+2 all year, with no daylight
 * saving, so it's exact there. BUSINESS_UTC_OFFSET_MINUTES overrides it for a
 * business elsewhere. Without it, a sale at 00:30 local time (22:30 UTC the
 * day before) would be counted on the wrong day.
 */
const OFFSET_MIN = parseInt(process.env.BUSINESS_UTC_OFFSET_MINUTES ?? '120', 10);
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The business's UTC offset in minutes (Zimbabwe: +120). For SQL that buckets rows by local day. */
export function localOffsetMinutes(): number {
  return OFFSET_MIN;
}

/** Today's date (YYYY-MM-DD) in the business's timezone. */
export function localToday(): string {
  return new Date(Date.now() + OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** [start, end) in UTC for a local calendar day. */
export function localDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - OFFSET_MIN * 60_000);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * Resolves a `?date=` query value: "today" → today's date; YYYY-MM-DD → as
 * is; absent → null (no day filter); anything else → an error message.
 */
export function parseDayParam(value: string | undefined): { date: string | null } | { error: string } {
  if (!value) return { date: null };
  if (value === 'today') return { date: localToday() };
  if (!DATE_RE.test(value)) return { error: 'date must be YYYY-MM-DD or "today".' };
  return { date: value };
}
