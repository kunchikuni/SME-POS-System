import { useEffect, useState } from 'react';
import { api, ApiError, OfflineError } from '../sync/apiClient';
import type { TillTask } from '../types/contract';
import { markSeen, notifyTasksChanged } from '../pos/taskAlerts';

/**
 * Tasks on the till: read + complete only. Fetched live from the network on
 * open — not stored offline, not part of the sync engine (see apiClient.ts).
 * If the till has no connection right now, that's shown plainly rather than
 * silently failing or showing stale data pretending to be current.
 * Neutral dark-glass styling — reached from both RetailTill and
 * RestaurantTill, not a mode-defining moment.
 */
/**
 * A due date is a calendar day (the server stores it at noon UTC so the day
 * is the same in every timezone) — so read the day out of the string rather
 * than converting the instant, and compare it with this device's today.
 */
function dueBadge(dueAt: string | null): { label: string; tone: string } | null {
    if (!dueAt) return null;
    const day = dueAt.slice(0, 10);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
    const diff = Math.round((dayMs(day) - dayMs(today)) / 86_400_000);
    if (diff < 0) return { label: diff === -1 ? 'Overdue · yesterday' : `Overdue · ${-diff} days`, tone: 'bg-red-500/10 text-red-300 ring-red-500/25' };
    if (diff === 0) return { label: 'Due today', tone: 'bg-amber-500/10 text-amber-300 ring-amber-500/25' };
    if (diff === 1) return { label: 'Due tomorrow', tone: 'bg-white/5 text-slate-300 ring-white/10' };
    const label = new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { label: `Due ${label}`, tone: 'bg-white/5 text-slate-400 ring-white/10' };
}

export function TasksPanel({
                               cashierId,
                               onClose,
                               onTasksChanged,
                           }: {
    cashierId: string | null;
    onClose: () => void;
    onTasksChanged?: () => void;
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
            // Opening the list is what "seeing" a task means — clears the button's new-task badge.
            markSeen(cashierId, res.tasks);
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
            onTasksChanged?.();
            notifyTasksChanged(); // the button's open count drops
        } catch {
            setError('Couldn’t mark that done — check the connection and try again.');
        } finally {
            setCompleting(null);
        }
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 anim-fade-in" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-sm anim-pop-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">Tasks</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close">
                        ✕
                    </button>
                </div>

                <div className="mt-4 max-h-96 overflow-y-auto dark-scroll">
                    {error && (
                        <div className="mb-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-300 ring-1 ring-amber-500/20">
                            {error}
                            <button onClick={load} className="ml-2 font-medium underline">
                                Retry
                            </button>
                        </div>
                    )}

                    {!error && tasks === null && <p className="py-8 text-center text-sm text-slate-500">Loading…</p>}

                    {tasks !== null && tasks.length === 0 && !error && (
                        <p className="py-8 text-center text-sm text-slate-500">All done — no open tasks.</p>
                    )}

                    {tasks !== null && tasks.length > 0 && (
                        <ul className="space-y-2">
                            {tasks.map((t) => (
                                <li key={t.id} className="flex items-start gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/8">
                                    <button
                                        onClick={() => complete(t)}
                                        disabled={completing === t.id}
                                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-white/20 hover:border-emerald-500 disabled:opacity-50 transition-colors"
                                        aria-label="Mark done"
                                    >
                                        {completing === t.id && '…'}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-white">{t.title}</p>
                                        {t.notes && <p className="mt-0.5 text-xs text-slate-400">{t.notes}</p>}
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                            {(() => {
                                                const due = dueBadge(t.due_at);
                                                return due && <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${due.tone}`}>{due.label}</span>;
                                            })()}
                                            <span>{t.assignee ?? 'Unassigned'}</span>
                                        </div>
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
