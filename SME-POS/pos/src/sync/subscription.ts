import type { SessionResponse } from '../types/contract';

/**
 * Where the business stands on payment, as the till last heard it.
 *
 *   active — paid, or on a free trial: nothing to say.
 *   grace  — the trial/subscription just ended; syncing still works, and the till
 *            shows a heads-up with the date it will pause.
 *   lapsed — the grace period is over: the server answers sync with 402. The till
 *            keeps selling (everything is saved on the device) and sync pauses
 *            until the owner renews.
 *
 * It is remembered across reloads (localStorage) so the banner is still there
 * when the till is offline — which is exactly when a cashier would otherwise
 * wonder why nothing is syncing.
 */
export type SubscriptionState = NonNullable<SessionResponse['subscription']>;

export const ACTIVE_SUBSCRIPTION: SubscriptionState = { state: 'active', graceEndsAt: null };

const KEY = 'wivae.pos.subscription';

export function loadSubscription(): SubscriptionState {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return ACTIVE_SUBSCRIPTION;
        const parsed = JSON.parse(raw) as Partial<SubscriptionState>;
        if (parsed.state === 'grace' || parsed.state === 'lapsed') {
            return { state: parsed.state, graceEndsAt: typeof parsed.graceEndsAt === 'string' ? parsed.graceEndsAt : null };
        }
    } catch {
        /* unreadable or blocked storage — fall through to "active" (never block a till on a guess) */
    }
    return ACTIVE_SUBSCRIPTION;
}

export function saveSubscription(next: SubscriptionState): void {
    try {
        if (next.state === 'active') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        /* storage blocked — the banner just won't survive a reload */
    }
}
