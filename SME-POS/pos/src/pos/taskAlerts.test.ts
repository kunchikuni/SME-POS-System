import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TillTask } from '../types/contract';
import {
    TASKS_CHANGED_EVENT, arrivals, describeArrivals, forCashier, loadSeen, markSeen, unseenFor,
} from './taskAlerts';

const ME = 'cashier-me';
const OTHER = 'cashier-other';
const task = (id: string, assigned_to: string | null = null, title = `Task ${id}`): TillTask => ({
    id, title, notes: null, due_at: null, assignee: assigned_to ? 'Someone' : null, assigned_to,
});

beforeEach(() => localStorage.clear());

describe('forCashier', () => {
    it("keeps the cashier's own tasks and unassigned ones, drops a colleague's", () => {
        const all = [task('a', ME), task('b', null), task('c', OTHER)];
        expect(forCashier(all, ME).map((t) => t.id)).toEqual(['a', 'b']);
    });
});

describe('arrivals', () => {
    it('is empty on the first poll — opening the till is not an arrival', () => {
        expect(arrivals(null, [task('a', ME), task('b')], ME)).toEqual([]);
    });

    it('returns tasks that were not in the previous poll', () => {
        const before = [task('a', ME)];
        const after = [task('a', ME), task('b', ME), task('c')];
        expect(arrivals(before, after, ME).map((t) => t.id)).toEqual(['b', 'c']);
    });

    it("ignores a new task that is assigned to someone else", () => {
        expect(arrivals([task('a')], [task('a'), task('b', OTHER)], ME)).toEqual([]);
    });

    it('does not re-announce a task that simply stays open', () => {
        const same = [task('a', ME)];
        expect(arrivals(same, same, ME)).toEqual([]);
    });

    it('does not announce when tasks are only completed (list shrinks)', () => {
        expect(arrivals([task('a', ME), task('b', ME)], [task('a', ME)], ME)).toEqual([]);
    });
});

describe('seen tracking', () => {
    it('starts empty, so everything waiting counts as new', () => {
        expect(loadSeen(ME).size).toBe(0);
        expect(unseenFor([task('a', ME), task('b')], ME, loadSeen(ME)).map((t) => t.id)).toEqual(['a', 'b']);
    });

    it('clears once the panel has listed them, and only for that cashier', () => {
        const open = [task('a', ME), task('b')];
        markSeen(ME, open);
        expect(unseenFor(open, ME, loadSeen(ME))).toEqual([]);
        // Rudo, sharing the till, hasn't looked — the unassigned task is still new to them.
        expect(unseenFor(open, OTHER, loadSeen(OTHER)).map((t) => t.id)).toEqual(['b']);
    });

    it('flags a task that arrives after the panel was last opened', () => {
        markSeen(ME, [task('a', ME)]);
        const later = [task('a', ME), task('b', ME)];
        expect(unseenFor(later, ME, loadSeen(ME)).map((t) => t.id)).toEqual(['b']);
    });

    it('drops completed tasks from the stored set instead of accumulating them', () => {
        markSeen(ME, [task('a', ME), task('b', ME)]);
        markSeen(ME, [task('b', ME)]);
        expect([...loadSeen(ME)]).toEqual(['b']);
    });

    it('tells the button to re-read', () => {
        const heard = vi.fn();
        window.addEventListener(TASKS_CHANGED_EVENT, heard);
        markSeen(ME, []);
        window.removeEventListener(TASKS_CHANGED_EVENT, heard);
        expect(heard).toHaveBeenCalledTimes(1);
    });

    it('survives corrupt or blocked storage', () => {
        localStorage.setItem('wivae.tasks.seen.cashier-me', '{not json');
        expect(loadSeen(ME).size).toBe(0);
        localStorage.setItem('wivae.tasks.seen.cashier-me', JSON.stringify({ not: 'an array' }));
        expect(loadSeen(ME).size).toBe(0);
        localStorage.setItem('wivae.tasks.seen.cashier-me', JSON.stringify(['a', 7, null, 'b']));
        expect([...loadSeen(ME)]).toEqual(['a', 'b']);
    });
});

describe('describeArrivals', () => {
    it('says "for you" only when it is assigned to the cashier', () => {
        expect(describeArrivals([task('a', ME, 'Count the till')], ME)).toEqual({ heading: 'New task for you', detail: 'Count the till' });
        expect(describeArrivals([task('a', null, 'Mop the floor')], ME)).toEqual({ heading: 'New task', detail: 'Mop the floor' });
    });

    it('summarises several at once', () => {
        expect(describeArrivals([task('a', ME, 'One'), task('b', ME, 'Two'), task('c', ME, 'Three')], ME))
            .toEqual({ heading: '3 new tasks for you', detail: 'One and 2 more' });
        expect(describeArrivals([task('a', ME, 'One'), task('b', null, 'Two')], ME).heading).toBe('2 new tasks');
    });
});
