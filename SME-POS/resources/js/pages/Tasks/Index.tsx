import { Head, useForm, usePage } from "@inertiajs/react";
import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface StaffOption {
  id: string;
  name: string;
}
interface Branch {
  id: string;
  name: string;
}
interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: "open" | "done";
  due_at: string | null;
  completed_at: string | null;
  assignee: string | null;
  assigned_to: string | null;
  creator: string | null;
  branch: string | null;
  branch_id: string | null;
}
interface Props {
  tasks: TaskRow[];
  status: "open" | "done" | "all";
  staff: StaffOption[];
  branches: Branch[];
  [key: string]: unknown;
}

/**
 * Store-operations checklist. Any dashboard user (Owner/Manager) can complete
 * a task; creating, assigning, and deleting is admin-only. Cashiers/waiters
 * see and complete their tasks from the till instead — a separate, simpler
 * online-first surface, not this page.
 */
export default function TasksIndex() {
  const { tasks, status, staff, branches } = usePage<Props>().props;
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);

  function setFilter(next: string) {
    window.location.href = `/tasks?status=${next}`;
  }

  return (
    <AppLayout>
      <Head title="Tasks" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">Store-operations checklist.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add task
        </button>
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {(["open", "done", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${
              status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {tasks.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">Nothing here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <TaskRowItem key={t.id} task={t} onEdit={() => setEditing(t)} />
            ))}
          </ul>
        )}
      </div>

      {(showAdd || editing) && (
        <TaskModal
          task={editing}
          staff={staff}
          branches={branches}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
        />
      )}
    </AppLayout>
  );
}

function TaskRowItem({ task, onEdit }: { task: TaskRow; onEdit: () => void }) {
  const toggleForm = useForm({});
  const deleteForm = useForm({});
  const done = task.status === "done";

  const overdue =
    !done && task.due_at !== null && new Date(task.due_at).getTime() < Date.now();

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={() =>
          toggleForm.post(`/tasks/${task.id}/${done ? "reopen" : "complete"}`, { preserveScroll: true })
        }
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
          done ? "border-green-500 bg-green-500 text-white" : "border-slate-300 hover:border-blue-500"
        }`}
        aria-label={done ? "Reopen" : "Mark done"}
      >
        {done && "✓"}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {task.title}
        </p>
        <p className="text-xs text-slate-400">
          {task.assignee ? `${task.assignee} · ` : "Unassigned · "}
          {task.branch ?? "All branches"}
          {task.due_at && (
            <span className={overdue ? "text-red-500" : ""}>
              {" "}
              · due {new Date(task.due_at).toLocaleDateString()}
            </span>
          )}
        </p>
      </div>

      <button onClick={onEdit} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
        Edit
      </button>
      <button
        onClick={() => {
          if (confirm(`Delete "${task.title}"?`)) {
            deleteForm.delete(`/tasks/${task.id}`, { preserveScroll: true });
          }
        }}
        className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
      >
        Delete
      </button>
    </li>
  );
}

function TaskModal({
  task,
  staff,
  branches,
  onClose,
}: {
  task: TaskRow | null;
  staff: StaffOption[];
  branches: Branch[];
  onClose: () => void;
}) {
  const form = useForm({
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    assigned_to: task?.assigned_to ?? "",
    branch_id: task?.branch_id ?? "",
    due_at: task?.due_at ? task.due_at.slice(0, 10) : "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const onSuccess = () => onClose();
    if (task) {
      form.patch(`/tasks/${task.id}`, { preserveScroll: true, onSuccess });
    } else {
      form.post("/tasks", { preserveScroll: true, onSuccess });
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 sm:p-6" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">{task ? "Edit task" : "Add task"}</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
            <input
              value={form.data.title}
              onChange={(e) => form.setData("title", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
            {form.errors.title && <p className="mt-1 text-sm text-red-600">{form.errors.title}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={form.data.notes}
              onChange={(e) => form.setData("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Assign to</label>
            <select
              value={form.data.assigned_to}
              onChange={(e) => form.setData("assigned_to", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">— Unassigned —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Branch</label>
            <select
              value={form.data.branch_id}
              onChange={(e) => form.setData("branch_id", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">— All branches —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Due date</label>
            <input
              type="date"
              value={form.data.due_at}
              onChange={(e) => form.setData("due_at", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={form.processing}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {form.processing ? "Saving…" : task ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </div>
  );
}
