import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TillTask } from '../types/contract';

vi.mock('../sync/apiClient', () => ({ api: { tasks: vi.fn() } }));

import { api } from '../sync/apiClient';
import { markSeen } from '../pos/taskAlerts';
import { TasksButton } from './TasksButton';

const ME = 'cashier-me';
const OTHER = 'cashier-other';
const task = (id: string, assigned_to: string | null = ME, title = `Task ${id}`): TillTask => ({
    id, title, notes: null, due_at: null, assignee: null, assigned_to,
});
const serve = (tasks: TillTask[]) => vi.mocked(api.tasks).mockResolvedValue({ tasks });

/** Mount, then let the first poll resolve. */
async function mount(onClick = vi.fn()) {
    render(<TasksButton cashierId={ME} onClick={onClick} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    return onClick;
}
/** Let the next 30s poll fire and resolve. */
const nextPoll = () => act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.mocked(api.tasks).mockReset();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('TasksButton', () => {
    it('shows a plain button when nothing is open', async () => {
        serve([]);
        await mount();
        expect(screen.getByRole('button', { name: 'Tasks' })).toBeTruthy();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it("badges what's already waiting at login — without a toast", async () => {
        serve([task('a'), task('b', null)]);
        await mount();
        expect(screen.getByRole('button', { name: 'Tasks, 2 new' })).toBeTruthy();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('toasts and bumps the badge when a task is assigned while the till is open', async () => {
        serve([task('a')]);
        await mount();
        expect(screen.getByRole('button', { name: 'Tasks, 1 new' })).toBeTruthy();

        serve([task('a'), task('b', ME, 'Count the till')]);
        await nextPoll();

        expect(screen.getByRole('button', { name: 'Tasks, 2 new' })).toBeTruthy();
        const toast = screen.getByRole('status');
        expect(toast.textContent).toContain('New task for you');
        expect(toast.textContent).toContain('Count the till');
    });

    it("does not alert for a task assigned to a colleague", async () => {
        serve([]);
        await mount();
        serve([task('x', OTHER)]);
        await nextPoll();
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('button', { name: 'Tasks' })).toBeTruthy();
    });

    it('"View tasks" opens the panel and dismisses the toast', async () => {
        serve([]);
        const onClick = await mount();
        serve([task('n', ME, 'Restock fridge')]);
        await nextPoll();

        fireEvent.click(screen.getByText('View tasks →'));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('drops the new-task badge to a quiet open count once the panel has listed the tasks', async () => {
        const open = [task('a'), task('b')];
        serve(open);
        await mount();
        expect(screen.getByRole('button', { name: 'Tasks, 2 new' })).toBeTruthy();

        // What TasksPanel does after it loads the list.
        await act(async () => { markSeen(ME, open); await vi.advanceTimersByTimeAsync(0); });
        expect(screen.getByRole('button', { name: 'Tasks, 2 open' })).toBeTruthy();
    });

    it('dismisses the toast by itself', async () => {
        serve([]);
        await mount();
        serve([task('n')]);
        await nextPoll();
        expect(screen.getByRole('status')).toBeTruthy();

        await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('keeps the last known state when a poll fails (offline)', async () => {
        serve([task('a')]);
        await mount();
        vi.mocked(api.tasks).mockRejectedValue(new Error('offline'));
        await nextPoll();
        expect(screen.getByRole('button', { name: 'Tasks, 1 new' })).toBeTruthy();
    });
});
