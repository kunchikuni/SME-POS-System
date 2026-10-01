import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SubscriptionBanner } from './Shared';
import { syncManager } from '../sync/syncManager';
import { ACTIVE_SUBSCRIPTION } from '../sync/subscription';

const set = (state: Parameters<typeof syncManager.setSubscription>[0]) => act(() => syncManager.setSubscription(state));

beforeEach(() => localStorage.clear());
afterEach(() => {
    cleanup();
    syncManager.setSubscription(ACTIVE_SUBSCRIPTION);
});

describe('SubscriptionBanner', () => {
    it('says nothing while the business is paid up', () => {
        render(<SubscriptionBanner />);
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('gives a heads-up, with the date, during the grace period — and can be dismissed', () => {
        render(<SubscriptionBanner />);
        set({ state: 'grace', graceEndsAt: '2026-10-20T12:00:00.000Z' });

        const note = screen.getByRole('status');
        expect(note.textContent).toContain('subscription has ended');
        expect(note.textContent).toContain('you can keep selling');
        expect(note.textContent).toMatch(/Renew by \d{1,2} \w{3}|Renew by \w{3} \d{1,2}/);

        fireEvent.click(screen.getByText('Dismiss'));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('tells the cashier their sales are safe once sync is paused, and offers Retry', () => {
        render(<SubscriptionBanner />);
        set({ state: 'lapsed', graceEndsAt: null });

        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('Sales are saved on this device');
        expect(alert.textContent).toContain('will sync once you renew');
        expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
        expect(screen.queryByText('Dismiss')).toBeNull(); // not dismissible: nothing is syncing
    });

    it('disappears again when the business renews', () => {
        render(<SubscriptionBanner />);
        set({ state: 'lapsed', graceEndsAt: null });
        expect(screen.getByRole('alert')).toBeTruthy();

        set(ACTIVE_SUBSCRIPTION);
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
