import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  MONTH_NAMES, WEEKDAYS_MON_FIRST, addDays, daysInMonth, deviceToday, firstWeekdayMonFirst,
  isIsoDate, isoDate, parseIso, shiftMonth, shortDate,
} from "../lib/dates.js";

/**
 * A calendar pop-over in the app's own theme — replaces the browser's native
 * `<input type="date">`, whose picker ignores our colours (and dark mode) and
 * looks different in every browser.
 *
 * Values are plain "YYYY-MM-DD" strings ("" = no date). Monday-first weeks.
 * Keyboard: arrow keys move by day/week, PageUp/PageDown by month, Enter or
 * Space picks, Escape closes.
 */
export function DatePicker({
  value, onChange, min, max, today: todayProp, placeholder = "Pick a date", allowClear = true, label, align = "left", className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  /** Earliest / latest selectable day (YYYY-MM-DD). */
  min?: string;
  max?: string;
  /** "Today" as the business sees it; defaults to this device's date. */
  today?: string;
  placeholder?: string;
  /** Show a Clear link (for optional dates). */
  allowClear?: boolean;
  label?: string;
  /** Which edge of the button the calendar lines up with. */
  align?: "left" | "right";
  className?: string;
}) {
  const today = todayProp && isIsoDate(todayProp) ? todayProp : deviceToday();
  const selected = isIsoDate(value) ? value : null;
  const [open, setOpen] = useState(false);
  // The month on show, and the day that has keyboard focus inside the grid.
  const start = selected ?? today;
  const [view, setView] = useState(() => ({ year: parseIso(start).year, month0: parseIso(start).month0 }));
  const [focusDay, setFocusDay] = useState(start);

  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  const disabled = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  function openPicker() {
    const s = selected ?? today;
    const clamped = disabled(s) ? (min && s < min ? min : max ?? s) : s;
    setView({ year: parseIso(clamped).year, month0: parseIso(clamped).month0 });
    setFocusDay(clamped);
    setOpen(true);
  }

  function pick(iso: string) {
    if (disabled(iso)) return;
    onChange(iso);
    setOpen(false);
  }

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Keep DOM focus on the focused day as it moves.
  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [open, focusDay, view]);

  function moveFocus(iso: string) {
    const p = parseIso(iso);
    setFocusDay(iso);
    if (p.year !== view.year || p.month0 !== view.month0) setView({ year: p.year, month0: p.month0 });
  }

  function onGridKey(e: KeyboardEvent) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in steps) { e.preventDefault(); moveFocus(addDays(focusDay, steps[e.key])); }
    else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const next = shiftMonth(parseIso(focusDay).year, parseIso(focusDay).month0, e.key === "PageUp" ? -1 : 1);
      moveFocus(isoDate(next.year, next.month0, Math.min(parseIso(focusDay).day, daysInMonth(next.year, next.month0))));
    } else if (e.key === "Home") { e.preventDefault(); moveFocus(isoDate(view.year, view.month0, 1)); }
    else if (e.key === "End") { e.preventDefault(); moveFocus(isoDate(view.year, view.month0, daysInMonth(view.year, view.month0))); }
  }

  // 6 weeks × 7 days, leading/trailing days from the neighbouring months dimmed.
  const cells = useMemo(() => {
    const lead = firstWeekdayMonFirst(view.year, view.month0);
    const first = isoDate(view.year, view.month0, 1);
    return Array.from({ length: 42 }, (_, i) => {
      const iso = addDays(first, i - lead);
      return { iso, inMonth: parseIso(iso).month0 === view.month0, day: parseIso(iso).day };
    });
  }, [view]);

  const goMonth = (by: number) => setView((v) => shiftMonth(v.year, v.month0, by));
  const canPrev = !min || isoDate(view.year, view.month0, 1) > min;
  const canNext = !max || addDays(isoDate(view.year, view.month0, daysInMonth(view.year, view.month0)), 1) <= max;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-surface px-3 py-2 text-left text-sm transition-colors hover:border-brand-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${open ? "border-brand-500" : "border-hairline"}`}
      >
        <span className={selected ? "text-ink" : "text-muted"}>{selected ? shortDate(selected) : placeholder}</span>
        <CalendarIcon />
      </button>

      {open && (
        <div
          id={popId}
          role="dialog"
          aria-label="Choose a date"
          className={`absolute z-50 mt-2 w-72 rounded-2xl border border-hairline bg-surface p-3 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => goMonth(-1)} disabled={!canPrev} aria-label="Previous month"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-brand-500/10 hover:text-ink disabled:opacity-30">‹</button>
            <span className="text-sm font-semibold text-ink" aria-live="polite">{MONTH_NAMES[view.month0]} {view.year}</span>
            <button type="button" onClick={() => goMonth(1)} disabled={!canNext} aria-label="Next month"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-brand-500/10 hover:text-ink disabled:opacity-30">›</button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
            {WEEKDAYS_MON_FIRST.map((w) => <span key={w} className="py-1">{w.slice(0, 2)}</span>)}
          </div>

          <div ref={gridRef} role="grid" onKeyDown={onGridKey} className="grid grid-cols-7 gap-y-0.5">
            {cells.map(({ iso, inMonth, day }) => {
              const isSel = iso === selected;
              const isToday = iso === today;
              const off = disabled(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  data-day={iso}
                  tabIndex={iso === focusDay ? 0 : -1}
                  disabled={off}
                  onClick={() => pick(iso)}
                  aria-label={shortDate(iso)}
                  aria-pressed={isSel}
                  aria-current={isToday ? "date" : undefined}
                  className={[
                    "mx-auto grid h-9 w-9 place-items-center rounded-full text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                    isSel ? "bg-brand-500 font-semibold text-white shadow-sm"
                      : off ? "cursor-not-allowed text-muted/40"
                      : inMonth ? "text-ink hover:bg-brand-500/10" : "text-muted/60 hover:bg-brand-500/10",
                    isToday && !isSel ? "ring-1 ring-brand-500/60 font-semibold" : "",
                  ].join(" ")}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-xs">
            <button type="button" onClick={() => pick(today)} disabled={disabled(today)}
              className="font-semibold text-brand-600 hover:underline disabled:opacity-40">Today</button>
            {allowClear && selected && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-muted hover:text-ink">Clear</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-muted" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  );
}
