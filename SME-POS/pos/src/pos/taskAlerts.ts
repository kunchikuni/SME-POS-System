import type { TillTask } from '../types/contract';

/**
 * New-task alerts for the till's Tasks button.
 *
 * Tasks aren't synced (they're fetched live — see TillTask), so "new" is worked
 * out on the till: the button polls, and a task counts as NEW to a cashier
 * until they've opened the Tasks panel with it in the list. "Seen" is kept in
 * localStorage per cashier, so a task assigned to Tendai keeps prompting Tendai
 * (not Rudo, who shares the till) and survives a reload.
 *
 * Kept free of React so the rules are unit-tested.
 */

/** Fired (on window) whenever the panel has been opened or a task completed, so the button re-reads. */
export const TASKS_CHANGED_EVENT = 'wivae:tasks-changed';

const seenKey = (cashierId: string | null) => `wivae.tasks.seen.${cashierId ?? 'anon'}`;

/**
 * The tasks worth alerting THIS cashier about: assigned to them, or to nobody
 * in particular (those are for whoever is on shift). A task assigned to a
 * colleague is still listed in the panel, but it doesn't ring for you.
 */
export function forCashier(tasks: TillTask[], cashierId: string | null): TillTask[] {
    return tasks.filter((t) => t.assigned_to === null || t.assigned_to === cashierId);
}

/**
 * Tasks that appeared since the previous poll. There is no "previous" on the
 * first poll — opening the till isn't an arrival (the badge covers what's
 * already waiting) — so that returns nothing.
 */
export function arrivals(previous: TillTask[] | null, next: TillTask[], cashierId: string | null): TillTask[] {
    if (previous === null) return [];
    const known = new Set(previous.map((t) => t.id));
    return forCashier(next, cashierId).filter((t) => !known.has(t.id));
}

export function loadSeen(cashierId: string | null): Set<string> {
    try {
        const raw = localStorage.getItem(seenKey(cashierId));
        const ids: unknown = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : []);
    } catch {
        return new Set(); // storage blocked or corrupt — everything simply counts as new
    }
}

/**
 * The cashier has looked at these tasks. The stored set is REPLACED by what's
 * open right now, so completed/deleted tasks drop out instead of piling up.
 */
export function markSeen(cashierId: string | null, tasks: TillTask[]): void {
    try {
        localStorage.setItem(seenKey(cashierId), JSON.stringify(tasks.map((t) => t.id)));
    } catch {
        /* storage blocked — the badge just won't clear across reloads */
    }
    notifyTasksChanged();
}

export function notifyTasksChanged(): void {
    window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
}

/** Tasks this cashier should be told about that they haven't opened yet. */
export function unseenFor(tasks: TillTask[], cashierId: string | null, seen: Set<string>): TillTask[] {
    return forCashier(tasks, cashierId).filter((t) => !seen.has(t.id));
}

/** Wording for the toast: who it's for, and what arrived. */
export function describeArrivals(arrived: TillTask[], cashierId: string | null): { heading: string; detail: string } {
    const first = arrived[0];
    if (arrived.length === 1) {
        return { heading: first.assigned_to !== null && first.assigned_to === cashierId ? 'New task for you' : 'New task', detail: first.title };
    }
    const mine = arrived.every((t) => t.assigned_to === cashierId);
    return {
        heading: `${arrived.length} new tasks${mine ? ' for you' : ''}`,
        detail: `${first.title} and ${arrived.length - 1} more`,
    };
}
