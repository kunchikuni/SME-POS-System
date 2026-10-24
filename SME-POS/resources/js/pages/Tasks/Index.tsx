import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api, type Task } from "../../lib/api.js";
import { DatePicker } from "../../Components/DatePicker.js";
import {
  MONTH_NAMES, WEEKDAYS_MON_FIRST, addDays, daysInMonth, deviceToday, dueDay, dueState, firstWeekdayMonFirst,
  friendlyDate, isoDate, parseIso, relativeDay, shiftMonth, shortDate, type DueState,
} from "../../lib/dates.js";

type Row = Task & { day: string | null; state: DueState };
type Filter = "open" | "overdue" | "today" | "done" | "all";
type Form = { title: string; notes: string; dueAt: string; assignedTo: string; branchId: string };
const EMPTY: Form = { title: "", notes: "", dueAt: "", assignedTo: "", branchId: "" };

/** How an open task's due date reads, by urgency. */
const TONE: Record<DueState, string> = {
  overdue: "bg-red-500/10 text-red-600 ring-red-500/25",
  today: "bg-amber-500/10 text-amber-600 ring-amber-500/25",
  soon: "bg-brand-500/10 text-brand-600 ring-brand-500/25",
  later: "bg-canvas text-muted ring-hairline",
  none: "bg-canvas text-muted ring-hairline",
};

/**
 * Tasks — checklist items for the business (open the shop, count the till,
 * chase a supplier), optionally assigned to someone and/or a branch, with a
 * due day. Shown here as a list or a month calendar; the same open tasks
 * show up on the till (Tasks button) for whoever is working the counter.
 */
export default function TasksIndex() {
  usePageTitle("Tasks");
  const { flash, showFlash } = useFlash();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "calendar" ? "calendar" : "list";

  const { data, loading, refetch } = useQuery(() => api.tasks.list(), []);
  const { data: staffData } = useQuery(() => api.staff.list(), []);
  const staff = (staffData?.staff ?? []).filter((s) => !s.deletedAt);
  const branches = staffData?.branches ?? [];
  const today = data?.today ?? deviceToday();

  const rows: Row[] = useMemo(
    () => (data?.tasks ?? []).map((t) => {
      const day = dueDay(t.dueAt);
      return { ...t, day, state: t.status === "done" ? "none" : dueState(day, today) };
    }),
    [data, today],
  );

  const [filter, setFilter] = useState<Filter>("open");
  const [assignee, setAssignee] = useState(""); // "" = everyone, "none" = unassigned, or a staff id
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const isOpen = (r: Row) => r.status !== "done";
  const counts = {
    open: rows.filter(isOpen).length,
    overdue: rows.filter((r) => r.state === "overdue").length,
    today: rows.filter((r) => r.state === "today").length,
    done: rows.filter((r) => !isOpen(r)).length,
  };

  const matchesAssignee = (r: Row) => !assignee || (assignee === "none" ? !r.assignedTo : r.assignedTo === assignee);
  const visible = rows.filter(matchesAssignee).filter((r) =>
    filter === "all" ? true : filter === "done" ? !isOpen(r) : filter === "open" ? isOpen(r) : r.state === filter,
  );

  const { submit: save, loading: saving, error: saveError, errors: saveErrors } = useMutation(
    (v: { id: string | null; form: Form }) => {
      const body = {
        title: v.form.title,
        notes: v.form.notes || null,
        dueAt: v.form.dueAt, // "" clears it
        assignedTo: v.form.assignedTo || null,
        branchId: v.form.branchId || null,
      };
      return v.id ? api.tasks.update(v.id, body) : api.tasks.create(body);
    },
    { onSuccess: () => { const wasNew = !editing?.id; setEditing(null); refetch(); showFlash(wasNew ? "Task added." : "Task updated."); } },
  );
  const { submit: toggle } = useMutation(
    (t: Task) => (t.status === "done" ? api.tasks.reopen(t.id) : api.tasks.complete(t.id)),
    { onSuccess: (_r) => refetch() },
  );
  const { submit: remove } = useMutation(
    (id: string) => api.tasks.delete(id),
    { onSuccess: () => { setConfirmDelete(null); refetch(); showFlash("Task deleted."); } },
  );

  const openNew = (dueAt = "") => setEditing({ id: null, form: { ...EMPTY, dueAt } });
  const openEdit = (t: Row) => setEditing({
    id: t.id,
    form: { title: t.title, notes: t.notes ?? "", dueAt: t.day ?? "", assignedTo: t.assignedTo ?? "", branchId: t.branchId ?? "" },
  });
  const setView = (v: "list" | "calendar") => {
    const next = new URLSearchParams(params);
    if (v === "calendar") next.set("view", "calendar"); else next.delete("view");
    setParams(next, { replace: true });
  };

  const cardProps = { today, staffCount: staff.length, confirmDelete, setConfirmDelete, onToggle: toggle, onEdit: openEdit, onDelete: remove };

  return (
    <AppLayout>
      {flash.message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${flash.type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>{flash.message}</div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Tasks</h1>
          <p className="mt-1 text-sm text-muted">
            {counts.open} open{counts.overdue > 0 && <> · <span className="font-medium text-red-600">{counts.overdue} overdue</span></>} · {counts.done} done
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-hairline bg-surface p-0.5 text-sm" role="tablist" aria-label="View">
            {(["list", "calendar"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 font-medium capitalize transition-colors ${view === v ? "bg-brand-500 text-white shadow-sm" : "text-muted hover:text-ink"}`}>{v}</button>
            ))}
          </div>
          <button onClick={() => openNew()} className="btn-primary text-sm">+ New task</button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(view === "list" ? ([
          ["open", "Open", counts.open], ["overdue", "Overdue", counts.overdue], ["today", "Due today", counts.today], ["done", "Done", counts.done], ["all", "All", rows.length],
        ] as [Filter, string, number][]) : []).map(([key, label, n]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === key ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-hairline text-muted hover:text-ink"}`}>
            {label} <span className="ml-0.5 tabular-nums opacity-70">{n}</span>
          </button>
        ))}
        {staff.length > 0 && (
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee"
            className="ml-auto rounded-xl border border-hairline bg-surface px-3 py-1.5 text-xs text-ink">
            <option value="">Everyone</option>
            <option value="none">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <span className="mx-auto mt-10 block h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      ) : view === "list" ? (
        <ListView rows={visible} filter={filter} today={today} totalTasks={rows.length} onNew={() => openNew()} cardProps={cardProps} />
      ) : (
        <CalendarView rows={rows.filter(matchesAssignee)} today={today} onNew={openNew} cardProps={cardProps} />
      )}

      {editing && (
        <TaskModal
          editing={editing.id !== null}
          form={editing.form}
          setForm={(f) => setEditing({ id: editing.id, form: f })}
          staff={staff}
          branches={branches}
          today={today}
          saving={saving}
          error={saveError}
          errors={saveErrors}
          onClose={() => setEditing(null)}
          onSave={() => save({ id: editing.id, form: editing.form })}
        />
      )}
    </AppLayout>
  );
}

// ── List ────────────────────────────────────────────────────────────────────

type CardProps = {
  today: string; staffCount: number;
  confirmDelete: string | null; setConfirmDelete: (id: string | null) => void;
  onToggle: (t: Task) => void; onEdit: (t: Row) => void; onDelete: (id: string) => void;
};

function ListView({ rows, filter, today, totalTasks, onNew, cardProps }: {
  rows: Row[]; filter: Filter; today: string; totalTasks: number; onNew: () => void; cardProps: CardProps;
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-hairline bg-surface p-10 text-center">
        <p className="text-base font-semibold text-ink">
          {totalTasks === 0 ? "No tasks yet" : filter === "done" ? "Nothing completed yet" : filter === "open" ? "All caught up 🎉" : "Nothing here"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {totalTasks === 0
            ? "Tasks are checklist items for your team — opening routines, stock checks, follow-ups. They appear on the till too."
            : "Nothing matches this filter."}
        </p>
        {totalTasks === 0 && <button onClick={onNew} className="btn-primary mt-4 text-sm">+ Add your first task</button>}
      </div>
    );
  }

  // Open tasks are grouped by urgency; done / all lists are flat.
  const sortByDue = (a: Row, b: Row) => (a.day ?? "9999").localeCompare(b.day ?? "9999") || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  const open = rows.filter((r) => r.status !== "done").sort(sortByDue);
  const done = rows.filter((r) => r.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const groups: { title: string; tone: string; rows: Row[] }[] = [
    { title: "Overdue", tone: "text-red-600", rows: open.filter((r) => r.state === "overdue") },
    { title: "Today", tone: "text-amber-600", rows: open.filter((r) => r.state === "today") },
    { title: "Upcoming", tone: "text-brand-600", rows: open.filter((r) => r.state === "soon" || r.state === "later") },
    { title: "No due date", tone: "text-muted", rows: open.filter((r) => r.state === "none") },
    { title: "Completed", tone: "text-muted", rows: done },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="mt-5 space-y-6">
      {groups.map((g) => (
        <section key={g.title}>
          <h2 className={`mb-2 text-xs font-semibold uppercase tracking-widest ${g.tone}`}>
            {g.title} <span className="font-normal opacity-70">· {g.rows.length}</span>
          </h2>
          <ul className="space-y-2">{g.rows.map((r) => <TaskCard key={r.id} row={r} {...cardProps} today={today} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function TaskCard({ row: t, today, staffCount, confirmDelete, setConfirmDelete, onToggle, onEdit, onDelete }: { row: Row } & CardProps) {
  const done = t.status === "done";
  const dueLabel = t.day && !done
    ? (t.state === "overdue" ? `Overdue · ${relativeDay(t.day, today).replace(" overdue", "")}` : t.state === "later" ? friendlyDate(t.day, today) : relativeDay(t.day, today))
    : null;
  return (
    <li className={`group flex items-start gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 transition-shadow hover:shadow-sm ${done ? "opacity-70" : ""}`}>
      <button
        onClick={() => onToggle(t)}
        aria-label={done ? `Reopen “${t.title}”` : `Mark “${t.title}” done`}
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${done ? "border-positive bg-positive text-white" : "border-hairline hover:border-positive"}`}
      >
        {done && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? "text-muted line-through" : "text-ink"}`}>{t.title}</p>
        {t.notes && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.notes}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {dueLabel && <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${TONE[t.state]}`}>{dueLabel}</span>}
          {done && t.completedAt && <span className="text-muted">Done {shortDate(t.completedAt.slice(0, 10))}{t.completer ? ` by ${t.completer.name}` : ""}</span>}
          {t.assignee
            ? <span className="inline-flex items-center gap-1 text-muted"><Avatar name={t.assignee.name} />{t.assignee.name}</span>
            : staffCount > 0 && !done && <span className="text-muted/70">Unassigned</span>}
          {t.branch && <span className="rounded-full bg-canvas px-2 py-0.5 text-muted ring-1 ring-inset ring-hairline">{t.branch.name}</span>}
        </div>
      </div>

      {confirmDelete === t.id ? (
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          <span className="text-muted">Delete?</span>
          <button onClick={() => onDelete(t.id)} className="rounded-lg bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700">Yes</button>
          <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-hairline px-2 py-1 text-muted hover:text-ink">No</button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-1 text-xs opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button onClick={() => onEdit(t)} className="rounded-lg px-2 py-1 text-muted hover:bg-brand-500/10 hover:text-ink">Edit</button>
          <button onClick={() => setConfirmDelete(t.id)} className="rounded-lg px-2 py-1 text-muted hover:bg-red-500/10 hover:text-red-600">Delete</button>
        </div>
      )}
    </li>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────

function CalendarView({ rows, today, onNew, cardProps }: { rows: Row[]; today: string; onNew: (dueAt: string) => void; cardProps: CardProps }) {
  const [month, setMonth] = useState(() => ({ year: parseIso(today).year, month0: parseIso(today).month0 }));
  const [selected, setSelected] = useState(today);

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) if (r.day) (m.get(r.day) ?? m.set(r.day, []).get(r.day)!).push(r);
    return m;
  }, [rows]);

  const cells = useMemo(() => {
    const first = isoDate(month.year, month.month0, 1);
    const lead = firstWeekdayMonFirst(month.year, month.month0);
    // 5 weeks when the month fits, 6 when it spills over.
    const weeks = Math.ceil((lead + daysInMonth(month.year, month.month0)) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const iso = addDays(first, i - lead);
      return { iso, inMonth: parseIso(iso).month0 === month.month0, day: parseIso(iso).day };
    });
  }, [month]);

  const undated = rows.filter((r) => !r.day && r.status !== "done");
  const dayRows = (byDay.get(selected) ?? []);
  const goTo = (by: number) => setMonth((m) => shiftMonth(m.year, m.month0, by));

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-2xl border border-hairline bg-surface p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{MONTH_NAMES[month.month0]} {month.year}</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => goTo(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-brand-500/10 hover:text-ink">‹</button>
            <button onClick={() => { setMonth({ year: parseIso(today).year, month0: parseIso(today).month0 }); setSelected(today); }}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-500/10">Today</button>
            <button onClick={() => goTo(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-brand-500/10 hover:text-ink">›</button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-hairline pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
          {WEEKDAYS_MON_FIRST.map((w) => <span key={w}><span className="sm:hidden">{w.slice(0, 1)}</span><span className="hidden sm:inline">{w}</span></span>)}
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-xl bg-hairline">
          {cells.map(({ iso, inMonth, day }) => {
            const list = byDay.get(iso) ?? [];
            const open = list.filter((r) => r.status !== "done");
            const isSel = iso === selected;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                onDoubleClick={() => onNew(iso)}
                aria-label={`${shortDate(iso)}, ${list.length} task${list.length === 1 ? "" : "s"}`}
                aria-pressed={isSel}
                className={`flex min-h-16 flex-col items-stretch gap-0.5 p-1 text-left align-top transition-colors sm:min-h-24 sm:p-1.5 ${inMonth ? "bg-surface" : "bg-canvas"} ${isSel ? "ring-2 ring-inset ring-brand-500" : "hover:bg-brand-500/5"}`}
              >
                <span className={`grid h-6 w-6 place-items-center self-start rounded-full text-xs tabular-nums ${iso === today ? "bg-brand-500 font-semibold text-white" : inMonth ? "text-ink" : "text-muted/60"}`}>{day}</span>
                {/* Wide screens: the tasks themselves. Phones: just a count. */}
                <span className="hidden flex-col gap-0.5 sm:flex">
                  {list.slice(0, 3).map((r) => (
                    <span key={r.id} className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${r.status === "done" ? "bg-canvas text-muted line-through" : TONE[r.state]}`}>{r.title}</span>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[11px] text-muted">+{list.length - 3} more</span>}
                </span>
                {open.length > 0 && <span className="mt-auto self-start rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white sm:hidden">{open.length}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">{friendlyDate(selected, today)}</h3>
              <p className="text-xs text-muted">{selected === today ? "Today · " : ""}{dayRows.length} task{dayRows.length === 1 ? "" : "s"}</p>
            </div>
            <button onClick={() => onNew(selected)} className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-500/10">+ Add</button>
          </div>
          {dayRows.length === 0
            ? <p className="mt-3 text-sm text-muted">Nothing due. Double-click a day, or use + Add.</p>
            : <ul className="mt-3 space-y-2">{dayRows.map((r) => <TaskCard key={r.id} row={r} {...cardProps} />)}</ul>}
        </section>

        {undated.length > 0 && (
          <section className="rounded-2xl border border-hairline bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">No due date <span className="font-normal text-muted">· {undated.length}</span></h3>
            <ul className="mt-3 space-y-2">{undated.map((r) => <TaskCard key={r.id} row={r} {...cardProps} />)}</ul>
          </section>
        )}
      </aside>
    </div>
  );
}

// ── Add / edit ──────────────────────────────────────────────────────────────

function TaskModal({ editing, form, setForm, staff, branches, today, saving, error, errors, onClose, onSave }: {
  editing: boolean; form: Form; setForm: (f: Form) => void;
  staff: { id: string; name: string; role: string }[];
  branches: { id: string; name: string }[];
  today: string; saving: boolean; error: string | null; errors: Record<string, string>;
  onClose: () => void; onSave: () => void;
}) {
  const set = (k: keyof Form) => (v: string) => setForm({ ...form, [k]: v });
  const selectCls = "w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (form.title.trim()) onSave(); }}
        className="my-auto w-full max-w-md rounded-2xl border border-hairline bg-surface p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-ink">{editing ? "Edit task" : "New task"}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>
        {error && !Object.keys(errors).length && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <div className="space-y-4">
          <Field label="Title" error={errors.title}>
            <input autoFocus value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Count the till before closing"
              className={selectCls} maxLength={200} />
          </Field>
          <Field label="Notes (optional)" error={errors.notes}>
            <textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} className={selectCls} maxLength={2000} />
          </Field>

          <Field label="Due date (optional)" error={errors.dueAt}>
            <DatePicker value={form.dueAt} onChange={set("dueAt")} today={today} placeholder="No due date" />
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {([["Today", today], ["Tomorrow", addDays(today, 1)], ["Next week", addDays(today, 7)]] as const).map(([label, d]) => (
                <button key={label} type="button" onClick={() => set("dueAt")(d)}
                  className={`rounded-full border px-2.5 py-1 transition-colors ${form.dueAt === d ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-hairline text-muted hover:text-ink"}`}>{label}</button>
              ))}
            </div>
          </Field>

          <Field label="Assign to (optional)" error={errors.assignedTo}>
            <select value={form.assignedTo} onChange={(e) => set("assignedTo")(e.target.value)} className={selectCls}>
              <option value="">Anyone</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </select>
          </Field>

          {branches.length > 1 && (
            <Field label="Branch" error={errors.branchId}>
              <select value={form.branchId} onChange={(e) => set("branchId")(e.target.value)} className={selectCls}>
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary text-sm disabled:opacity-50">
            {saving ? "Saving…" : editing ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-500/15 text-[9px] font-semibold uppercase text-brand-600" aria-hidden>{name.trim().charAt(0)}</span>;
}
