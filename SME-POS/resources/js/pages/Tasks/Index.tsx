import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";
import { useState } from "react";

export default function TasksIndex() {
  usePageTitle("Tasks");
  const { flash, showFlash } = useFlash();
  const { data, loading, refetch } = useQuery(() => api.tasks.list(), []);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", dueAt: "", assignedTo: "" });

  const tasks = data?.tasks ?? [];

  const { submit: createTask, loading: creating } = useMutation(
    (d: typeof form) => api.tasks.create(d),
    { onSuccess: () => { setShowAdd(false); setForm({ title: "", notes: "", dueAt: "", assignedTo: "" }); refetch(); showFlash("Task created."); } }
  );
  const { submit: completeTask } = useMutation(
    (id: string) => api.tasks.complete(id),
    { onSuccess: () => { refetch(); showFlash("Task completed."); } }
  );
  const { submit: deleteTask } = useMutation(
    (id: string) => api.tasks.delete(id),
    { onSuccess: () => { refetch(); showFlash("Task deleted."); } }
  );

  const open = tasks.filter((t: any) => t.status === "open");
  const done = tasks.filter((t: any) => t.status === "done");

  return (
    <AppLayout>
      {flash.message && <Flash msg={flash.message} type={flash.type} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Tasks</h1>
          <p className="mt-1 text-sm text-muted">{open.length} open · {done.length} done</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">+ New Task</button>
      </div>

      {loading ? <Spinner className="mt-8 mx-auto" /> : (
        <>
          <TaskList title="Open" tasks={open} onComplete={completeTask} onDelete={deleteTask} />
          {done.length > 0 && <TaskList title="Completed" tasks={done} onComplete={() => {}} onDelete={deleteTask} />}
        </>
      )}

      {showAdd && (
        <Modal title="New Task" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <Field label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
            <Field label="Notes (optional)" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
            <Field label="Due date (optional)" type="date" value={form.dueAt} onChange={v => setForm(f => ({ ...f, dueAt: v }))} />
            <Field label="Assigned to (optional)" value={form.assignedTo} onChange={v => setForm(f => ({ ...f, assignedTo: v }))} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={() => createTask(form)} disabled={creating} className="btn-primary text-sm">{creating ? "Saving…" : "Create"}</button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

function TaskList({ title, tasks, onComplete, onDelete }: { title: string; tasks: any[]; onComplete: (id: string) => void; onDelete: (id: string) => void }) {
  if (tasks.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{title}</h2>
      <ul className="space-y-2">
        {tasks.map((t: any) => (
          <li key={t.id} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.notes && <p className="text-xs text-muted">{t.notes}</p>}
              {t.dueAt && <p className="text-xs text-muted">Due {new Date(t.dueAt).toLocaleDateString()}</p>}
            </div>
            <div className="flex gap-2">
              {t.status === "open" && (
                <button onClick={() => onComplete(t.id)} className="rounded-lg border border-positive/30 px-2 py-1 text-xs text-positive hover:bg-positive/5">Done</button>
              )}
              <button onClick={() => { if (confirm("Delete this task?")) onDelete(t.id); }}
                className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-hairline px-3 py-2 text-sm" />
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Flash({ msg, type }: { msg: string; type: "success" | "error" }) {
  return <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>{msg}</div>;
}
function Spinner({ className = "" }: { className?: string }) {
  return <span className={`block h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent ${className}`} />;
}
