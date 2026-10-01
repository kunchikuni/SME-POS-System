import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DatePicker } from "./DatePicker.js";

/**
 * One-day-at-a-time browsing, shared by Orders and Transactions.
 *
 * Days are the business's local calendar days: the server resolves "today"
 * and each day's boundaries in the business's timezone
 * (server/src/lib/businessDay.ts), so the client only ever deals in plain
 * YYYY-MM-DD strings. The chosen day and branch live in the URL (?date=,
 * ?branch=), so a day can be bookmarked or shared.
 */

/** YYYY-MM-DD ± n days — pure calendar arithmetic, no timezone involved. */
export function shiftDay(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Tuesday, 22 September 2026" */
export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", ecocash: "EcoCash", innbucks: "InnBucks", omari: "Omari",
  onemoney: "OneMoney", zipit: "ZIPIT", other: "Other", credit: "Credit",
};

/** URL-backed day + branch + page state for a day view. */
export function useDayView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const requestedDate = searchParams.get("date") ?? "today";
  const branchFilter = searchParams.get("branch") ?? "";

  function showDay(date: string, today: string | null) {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (today && date === today) next.delete("date"); else next.set("date", date);
    setSearchParams(next, { replace: true });
  }

  function showBranch(id: string) {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("branch", id); else next.delete("branch");
    setSearchParams(next, { replace: true });
  }

  return { requestedDate, branchFilter, page, setPage, showDay, showBranch };
}

/** ◀ Previous day / date / Next day ▶, a Today shortcut, and a branch filter. */
export function DayPicker({ shownDate, today, onDay, branches, branchFilter, onBranch }: {
  shownDate: string | null;
  today: string | null;
  onDay: (date: string) => void;
  branches: { id: string; name: string }[];
  branchFilter: string;
  onBranch: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => shownDate && onDay(shiftDay(shownDate, -1))}
        disabled={!shownDate}
        className="btn-secondary text-xs disabled:opacity-40"
      >◀ Previous day</button>
      {/* Our own calendar (not the browser's native date picker): themed,
          dark-mode aware, and "today" is the BUSINESS's today. A sales day is
          never in the future, so those days are disabled. */}
      <DatePicker
        value={shownDate ?? ""}
        max={today ?? undefined}
        today={today ?? undefined}
        allowClear={false}
        placeholder="Pick a day"
        onChange={(d) => d && onDay(d)}
        className="w-44"
      />
      <button
        onClick={() => shownDate && onDay(shiftDay(shownDate, 1))}
        disabled={!shownDate || !today || shownDate >= today}
        className="btn-secondary text-xs disabled:opacity-40"
      >Next day ▶</button>
      {shownDate && today && shownDate !== today && (
        <button onClick={() => onDay(today)} className="btn-secondary text-xs">Today</button>
      )}
      {branches.length > 1 && (
        <select
          value={branchFilter}
          onChange={(e) => onBranch(e.target.value)}
          className="rounded-xl border border-hairline bg-surface px-3 py-1.5 text-sm"
          aria-label="Branch"
        >
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
    </div>
  );
}

/** Heading line under a day view's title: "Today · Tuesday, 29 September 2026". */
export function dayHeading(shownDate: string | null, today: string | null): string {
  if (!shownDate) return " ";
  return shownDate === today ? `Today · ${longDate(shownDate)}` : longDate(shownDate);
}
