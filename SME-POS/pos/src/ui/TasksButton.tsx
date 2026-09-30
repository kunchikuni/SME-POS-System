import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../sync/apiClient';
import type { TillTask } from '../types/contract';
import { TASKS_CHANGED_EVENT, arrivals, describeArrivals, forCashier, loadSeen, unseenFor } from '../pos/taskAlerts';

const POLL_MS = 30_000;
const TOAST_MS = 9_000;

/**
 * Watches /pos/tasks for the cashier on shift: how many are open for them, how
 * many they haven't opened yet, and which ones just arrived. Tasks aren't part
 * of the sync engine, so this is a plain poll — every 30s while the till is
 * visible, plus straight away when the tab comes back or the connection
 * returns. A failed poll (offline) just keeps what was last known.
 * The rules live in pos/taskAlerts.ts.
 */
function useTaskAlerts(cashierId: string | null) {
    const [tasks, setTasks] = useState<TillTask[]>([]);
    const [seen, setSeen] = useState(() => loadSeen(cashierId));
    const [arrived, setArrived] = useState<TillTask[]>([]);
    const previous = useRef<TillTask[] | null>(null);
    const inFlight = useRef(false);

    const refresh = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            const res = await api.tasks();
            // Tell them about new arrivals — unless they've already looked at that task.
            const alreadySeen = loadSeen(cashierId);
            const fresh = arrivals(previous.current, res.tasks, cashierId).filter((t) => !alreadySeen.has(t.id));
            previous.current = res.tasks;
            setTasks(res.tasks);
            setSeen(alreadySeen);
            if (fresh.length > 0) setArrived((a) => [...a, ...fresh]);
        } catch {
            /* offline or a blip — keep showing the last known state */
        } finally {
            inFlight.current = false;
        }
    }, [cashierId]);

    useEffect(() => {
        // A different cashier (or first mount): start fresh.
        previous.current = null;
        setArrived([]);
        setSeen(loadSeen(cashierId));
        void refresh();

        const tick = () => { if (!document.hidden) void refresh(); };
        const timer = setInterval(tick, POLL_MS);
        document.addEventListener('visibilitychange', tick);
        window.addEventListener('online', tick);
        // The panel was opened (→ seen) or a task was completed.
        window.addEventListener(TASKS_CHANGED_EVENT, tick);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', tick);
            window.removeEventListener('online', tick);
            window.removeEventListener(TASKS_CHANGED_EVENT, tick);
        };
    }, [cashierId, refresh]);

    const dismiss = useCallback(() => setArrived([]), []);

    return {
        open: forCashier(tasks, cashierId).length,
        unseen: unseenFor(tasks, cashierId, seen).length,
        arrived,
        dismiss,
    };
}

/**
 * The till header's Tasks button: a violet badge with the number of tasks the
 * cashier hasn't opened yet (it clears when they open the panel), a quiet count
 * of what's still open, and a toast when a task arrives while they're working.
 * Used by every till layout.
 */
export function TasksButton({
    cashierId,
    onClick,
}: {
    cashierId: string | null;
    onClick: () => void;
}) {
    const { open, unseen, arrived, dismiss } = useTaskAlerts(cashierId);

    return (
        <>
            <button
                onClick={onClick}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-colors"
                aria-label={unseen > 0 ? `Tasks, ${unseen} new` : open > 0 ? `Tasks, ${open} open` : 'Tasks'}
                title={unseen > 0 ? `${unseen} new task${unseen === 1 ? '' : 's'}` : open > 0 ? `${open} open task${open === 1 ? '' : 's'}` : 'Tasks'}
            >
                <span>Tasks</span>
                {unseen > 0 ? (
                    // key → the badge pops again each time the number changes
                    <span key={unseen} className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(124,58,237,0.6)] ring-1 ring-white/20 anim-pop-in">
                        {unseen}
                    </span>
                ) : open > 0 ? (
                    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white/10 px-1 text-[10px] font-semibold text-slate-300">
                        {open}
                    </span>
                ) : null}
            </button>

            {arrived.length > 0 && (
                <ArrivalToast
                    arrived={arrived}
                    cashierId={cashierId}
                    onView={() => { dismiss(); onClick(); }}
                    onDismiss={dismiss}
                />
            )}
        </>
    );
}

/** "New task for you — Count the till · View ✕". Solid dark card so it reads in either theme. */
function ArrivalToast({ arrived, cashierId, onView, onDismiss }: {
    arrived: TillTask[];
    cashierId: string | null;
    onView: () => void;
    onDismiss: () => void;
}) {
    // Another arrival while it's up extends the stay.
    useEffect(() => {
        const timer = setTimeout(onDismiss, TOAST_MS);
        return () => clearTimeout(timer);
    }, [arrived.length, onDismiss]);

    const { heading, detail } = describeArrivals(arrived, cashierId);

    // Portalled: the header's ancestors must not be able to trap `fixed`.
    return createPortal(
        <div
            role="status"
            aria-live="polite"
            className="fixed right-4 top-16 z-50 flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-xl bg-slate-900 p-3 pr-2 text-white shadow-2xl ring-1 ring-violet-500/40 anim-slide-up"
        >
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-600 text-sm shadow-[0_0_12px_rgba(124,58,237,0.6)]" aria-hidden>🔔</span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{heading}</p>
                <p className="truncate text-xs text-slate-300">{detail}</p>
                <button onClick={onView} className="mt-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200">View tasks →</button>
            </div>
            <button onClick={onDismiss} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Dismiss">✕</button>
        </div>,
        document.body,
    );
}
