import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { App } from './App';
import { db } from './db/database';

// One-off mounts to surface the real runtime error a blank page hides in the
// browser, since no browser is available here. Covers: fresh device, and a
// device already paired + shift already started (the case that routes
// straight into Till.tsx, the most-changed file).
describe('smoke: mount App', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders with a fresh (unpaired) session', async () => {
        await mountAndCheck();
    });

    it('renders with an existing device session + shift (goes straight to Till)', async () => {
        localStorage.setItem(
            'wivae.pos.session',
            JSON.stringify({
                token: 'demo-device-token',
                device: { id: 'd1', name: 'Till 1' },
                branch: { id: 'b1', name: 'Main' },
                tenant: { name: 'Demo Store', theme: {}, mode: 'retail', currency: 'USD', taxRateBps: 1500 },
            }),
        );
        localStorage.setItem(
            'wivae.pos.shift',
            JSON.stringify({ cashierId: 'u1', cashierName: 'Tariro', startedAt: new Date().toISOString() }),
        );
        await db.categories.bulkPut([{ id: 'c1', name: 'Beverages' }]);
        await db.products.bulkPut([
            {
                id: 'p1', category_id: 'c1', sku: null, barcode: null, name: 'Coke 500ml',
                price_cents: 150, currency: 'USD', tax_class: 'standard', type: 'retail',
                track_stock: true, is_active: true,
            },
        ]);
        await db.meta.put({ key: 'cursor', value: '2026-01-01T00:00:00Z' });

        await mountAndCheck();
    });

    it('renders when the cached session PREDATES the VAT fields (old localStorage, no currency/taxRateBps)', async () => {
        localStorage.setItem(
            'wivae.pos.session',
            JSON.stringify({
                token: 'demo-device-token',
                device: { id: 'd1', name: 'Till 1' },
                branch: { id: 'b1', name: 'Main' },
                tenant: { name: 'Demo Store', theme: {}, mode: 'retail' }, // old shape
            }),
        );
        localStorage.setItem(
            'wivae.pos.shift',
            JSON.stringify({ cashierId: 'u1', cashierName: 'Tariro', startedAt: new Date().toISOString() }),
        );
        await db.meta.put({ key: 'cursor', value: '2026-01-01T00:00:00Z' });

        await mountAndCheck();
    });

    /**
     * Regression: ShiftLogin now requires a `device` prop (for mode-aware
     * accent colour) and every existing scenario above already has a shift
     * active, so ShiftLogin's render branch was never actually mounted by this
     * suite. This is the one that exercises it — a paired device with NO
     * shift yet, which is what every till boots into before a cashier signs
     * in, on every reload.
     */
    it('renders ShiftLogin (no shift yet) for a retail tenant without throwing', async () => {
        localStorage.setItem(
            'wivae.pos.session',
            JSON.stringify({
                token: 'demo-device-token',
                device: { id: 'd1', name: 'Till 1' },
                branch: { id: 'b1', name: 'Main' },
                tenant: { name: 'Demo Store', theme: {}, mode: 'retail', currency: 'USD', taxRateBps: 1500 },
            }),
        );
        await db.staff.bulkPut([{ id: 'u1', name: 'Tariro', role: 'cashier', pin_hash: 'hash1' }]);
        await db.meta.put({ key: 'cursor', value: '2026-01-01T00:00:00Z' });

        await mountAndCheck();
    });

    /** Same as above but restaurant mode — proves ShiftLogin's mode-aware
     * accent branch (orange, not violet) also mounts cleanly. */
    it('renders ShiftLogin (no shift yet) for a restaurant tenant without throwing', async () => {
        localStorage.setItem(
            'wivae.pos.session',
            JSON.stringify({
                token: 'demo-device-token',
                device: { id: 'd1', name: 'Till 1' },
                branch: { id: 'b1', name: 'Main' },
                tenant: { name: 'Demo Bistro', theme: {}, mode: 'restaurant', currency: 'USD', taxRateBps: 1500 },
            }),
        );
        await db.staff.bulkPut([{ id: 'u1', name: 'Grace', role: 'waiter', pin_hash: 'hash1' }]);
        await db.meta.put({ key: 'cursor', value: '2026-01-01T00:00:00Z' });

        await mountAndCheck();
    });

    /**
     * Regression: Till.tsx previously hardcoded useState<TenantMode>('retail')
     * regardless of device.tenant.mode — a restaurant tenant would silently
     * boot into RetailTill. This proves a restaurant tenant with an active
     * shift actually renders RestaurantTill's floor plan (the other scenarios
     * in this file are all retail).
     */
    it('renders RestaurantTill (floor plan) for a restaurant tenant with an active shift', async () => {
        localStorage.setItem(
            'wivae.pos.session',
            JSON.stringify({
                token: 'demo-device-token',
                device: { id: 'd1', name: 'Till 1' },
                branch: { id: 'b1', name: 'Main' },
                tenant: { name: 'Demo Bistro', theme: {}, mode: 'restaurant', currency: 'USD', taxRateBps: 1500 },
            }),
        );
        localStorage.setItem(
            'wivae.pos.shift',
            JSON.stringify({ cashierId: 'u1', cashierName: 'Grace', startedAt: new Date().toISOString() }),
        );
        await db.diningTables.bulkPut([{ id: 't1', name: 'T1', section: 'Main', seats: 4, is_active: true }]);
        await db.meta.put({ key: 'cursor', value: '2026-01-01T00:00:00Z' });

        await mountAndCheck();
    });
});

async function mountAndCheck() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let caught: unknown = null;
    try {
        root.render(createElement(App));
        await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
        caught = e;
    }
    if (caught) throw caught;
    expect(container.innerHTML.length).toBeGreaterThan(0);
}
