import { useEffect, useState } from 'react';
import { api, ApiError, OfflineError } from '../sync/apiClient';
import type { TillTask } from '../types/contract';

/**
 * Tasks on the till: read + complete only. Fetched live from the network on
 * open — not stored offline, not part of the sync engine (see apiClient.ts).
 * If the till has no connection right now, that's shown plainly rather than
 * silently failing or showing stale data pretending to be current.
 */
export function TasksPanel({
  cashierId,
  onClose,
}: {
  cashierId: string | null;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<TillTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError(null);
    try {
      const res = await api.tasks();
      setTasks(res.tasks);
    } catch (e) {
      setTasks(null);
      setError(
        e instanceof OfflineError
          ? 'No connection right now. Tasks need the network — try again shortly.'
          : e instanceof ApiError
            ? 'Couldn’t load tasks.'
            : 'Something went wrong.',
      );
    }
  }

  async function complete(task: TillTask) {
    setCompleting(task.id);
    try {
      await api.completeTask(task.id, cashierId);
      setTasks((t) => t?.filter((x) => x.id !== task.id) ?? null);
    } catch {
      setError('Couldn’t mark that done — check the connection and try again.');
    } finally {
      setCompleting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 max-h-96 overflow-y-auto">
          {error && (
            <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              {error}
              <button onClick={load} className="ml-2 font-medium underline">
                Retry
              </button>
            </div>
          )}

          {!error && tasks === null && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}

          {tasks !== null && tasks.length === 0 && !error && (
            <p className="py-8 text-center text-sm text-slate-400">All done — no open tasks.</p>
          )}

          {tasks !== null && tasks.length > 0 && (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                  <button
                    onClick={() => complete(t)}
                    disabled={completing === t.id}
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-slate-300 hover:border-green-500 disabled:opacity-50"
                    aria-label="Mark done"
                  >
                    {completing === t.id && '…'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    {t.notes && <p className="mt-0.5 text-xs text-slate-500">{t.notes}</p>}
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t.assignee ? t.assignee : 'Unassigned'}
                      {t.due_at && ` · due ${new Date(t.due_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
