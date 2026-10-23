import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RestaurantTill } from './RestaurantTill';
import { db } from '../db/database';
import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';

/**
 * The restaurant till's order sheet on a phone.
 *
 * The sheet used to be ONE scroller (`overflow-y-auto` around the whole cart), so on a long order the
 * "Send & Settle" button was part of what scrolled away: measured at 668-716px on a 560px-tall phone,
 * i.e. off-screen. The sheet is now a bounded column in which only the order lines scroll, so the
 * payment area and the button stay in view. jsdom has no layout, so this guards the classes that
 * implement it; the live measurement is in the commit message.
 */
const session = {
    token: 'test-device-token',
    device: { id: 'd1', name: 'Till 1' },
    branch: { id: 'b1', name: 'Main', mode: 'restaurant' },
    tenant: { name: 'Test Restaurant', theme: {}, currency: 'USD', taxRateBps: 0 },
} as unknown as DeviceSession;
const shift = { cashierId: 'u1', cashierName: 'Tariro', role: 'cashier', startedAt: new Date().toISOString() } as unknown as Shift;

const DISH = 'Grilled chicken';

beforeEach(async () => {
    localStorage.clear();
    await Promise.all([db.categories.clear(), db.products.clear(), db.stock.clear(), db.diningTables.clear(), db.sales.clear(), db.outbox.clear(), db.meta.clear()]);
    await db.diningTables.bulkPut([{ id: 't1', name: 'T1', section: 'Main', seats: 4, is_active: true }]);
    await db.products.bulkPut([
        { id: 'p1', category_id: null, sku: null, barcode: null, name: DISH, price_cents: 650, currency: 'USD', tax_class: 'standard', type: 'restaurant', track_stock: false, is_active: true },
    ] as never);
});
afterEach(() => cleanup());

async function openSheet() {
    const view = render(<RestaurantTill device={session} shift={shift} onEndShift={() => {}} />);
    fireEvent.click((await screen.findByText('T1')).closest('button')!); // choose the table
    fireEvent.click((await screen.findByText(DISH)).closest('button')!); // add a dish
    fireEvent.click(await screen.findByRole('button', { name: /1 item/ })); // the pill
    return { ...view, sheet: view.container.querySelector<HTMLElement>('.fixed.inset-0')! };
}

describe('restaurant till: order sheet on a phone', () => {
    it('opens from the pill with the Send & Settle button inside it', async () => {
        const { sheet } = await openSheet();
        expect(within(sheet).getByRole('button', { name: /Send & Settle · \$6\.50/ })).toBeTruthy();
        expect(within(sheet).getByText(DISH)).toBeTruthy();
    });

    it('is a bounded column, not a scroller: the whole sheet never scrolls the button away', async () => {
        const { sheet } = await openSheet();
        const panel = sheet.firstElementChild as HTMLElement;
        expect(panel.className).toContain('max-h-[88dvh]'); // dvh: a phone browser's address bar shrinks the screen
        const wrapper = panel.querySelector('.flex-col.max-h-\\[calc\\(88dvh-24px\\)\\]') as HTMLElement | null;
        expect(wrapper, 'the cart sits in a flex column with a height limit').not.toBeNull();
        expect(wrapper!.className).not.toContain('overflow-y-auto'); // the old version: one scroller around everything
    });

    it('lets the order lines (and only them) scroll', async () => {
        const { sheet } = await openSheet();
        const list = within(sheet).getByText(DISH).closest('.overflow-y-auto') as HTMLElement | null;
        expect(list, 'the lines are in their own scroller').not.toBeNull();
        // the cart root may shrink inside the bounded column, or the list never gets a height to scroll within
        const root = list!.parentElement as HTMLElement;
        expect(root.className).toContain('min-h-0');
        expect(root.className).toContain('flex-col');
    });

    it('keeps the sidebar copy of the cart for wide screens', async () => {
        const { container } = await openSheet();
        const aside = container.querySelector('aside')!;
        expect(aside.className).toContain('hidden');
        expect(aside.className).toContain('lg:flex');
    });
});
