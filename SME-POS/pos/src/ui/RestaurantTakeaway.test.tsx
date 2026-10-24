import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RestaurantTill } from './RestaurantTill';
import { db } from '../db/database';
import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';

/**
 * The restaurant till's floor plan: a Takeaway button that needs no table, and tables in a readable order.
 *
 * An order used to start only by tapping a table, and a restaurant with no tables (every new one, until
 * default tables were added at sign-up) opened to "No tables yet" with nothing to tap. Takeaway is always
 * there: the order, its kitchen ticket and the receipt all cope with no table.
 */
const session = {
    token: 'test-device-token',
    device: { id: 'd1', name: 'Till 1' },
    branch: { id: 'b1', name: 'Main', mode: 'restaurant' },
    tenant: { name: 'Test Restaurant', theme: {}, currency: 'USD', taxRateBps: 0 },
} as unknown as DeviceSession;
const shift = { cashierId: 'u1', cashierName: 'Tariro', role: 'cashier', startedAt: new Date().toISOString() } as unknown as Shift;

const DISH = 'Grilled chicken';
const table = (id: string, name: string, section: string | null = null) => ({ id, name, section, seats: 0, is_active: true });

beforeEach(async () => {
    localStorage.clear();
    await Promise.all([db.categories.clear(), db.products.clear(), db.stock.clear(), db.diningTables.clear(), db.sales.clear(), db.outbox.clear(), db.meta.clear()]);
    await db.products.bulkPut([
        { id: 'p1', category_id: null, sku: null, barcode: null, name: DISH, price_cents: 650, currency: 'USD', tax_class: 'standard', type: 'restaurant', track_stock: false, is_active: true },
    ] as never);
});
afterEach(() => cleanup());

const mount = () => render(<RestaurantTill device={session} shift={shift} onEndShift={() => {}} />);
const takeawayButton = () => screen.findByRole('button', { name: /Takeaway.*no table/i });
const tableOrder = () => [...document.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => /^T\d+/.test(t)).map((t) => t.match(/^T\d+/)![0]);

describe('the floor plan', () => {
    it('has a Takeaway button even when the branch has no tables at all', async () => {
        mount();
        expect(await takeawayButton()).toBeTruthy();
    });

    it('says plainly that no tables are set up, and no longer promises a dashboard page that does not exist', async () => {
        mount();
        await takeawayButton();
        expect(screen.getByText(/No tables set up for this branch/)).toBeTruthy();
        expect(screen.getByText(/still take orders as Takeaway/)).toBeTruthy();
        expect(screen.queryByText(/Add tables in the dashboard/)).toBeNull();
    });

    it('keeps the Takeaway button above the tables when there are some', async () => {
        await db.diningTables.bulkPut([table('t1', 'T1')]);
        mount();
        const takeaway = await takeawayButton();
        const t1 = (await screen.findByText('T1')).closest('button')!;
        expect(takeaway.compareDocumentPosition(t1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the table comes after it
        expect(screen.queryByText(/No tables set up/)).toBeNull();
    });

    it('lists the tables in natural order (T2 before T10), however they are stored', async () => {
        // stored under ids that sort the wrong way round
        await db.diningTables.bulkPut([table('c', 'T10'), table('a', 'T2'), table('d', 'T1'), table('b', 'T3')]);
        mount();
        await screen.findByText('T10');
        expect(tableOrder()).toEqual(['T1', 'T2', 'T3', 'T10']);
    });

    it('orders the sections too, with unnamed tables under "Floor"', async () => {
        await db.diningTables.bulkPut([table('1', 'T1', 'Patio'), table('2', 'T2'), table('3', 'T3', 'Main')]);
        mount();
        await screen.findByText('T1');
        const headings = [...document.querySelectorAll('span')].map((s) => s.textContent ?? '').filter((t) => ['Floor', 'Main', 'Patio'].includes(t));
        expect(headings).toEqual(['Floor', 'Main', 'Patio']);
    });
});

describe('taking a Takeaway order', () => {
    it('opens the menu titled as a takeaway, with a way back to the floor plan', async () => {
        mount();
        fireEvent.click(await takeawayButton());
        await screen.findByText(DISH);
        expect(screen.getAllByText('Takeaway order').length).toBeGreaterThan(0);
        const back = screen.getByRole('button', { name: /Takeaway · change/ });
        fireEvent.click(back);
        expect(await takeawayButton()).toBeTruthy(); // back on the floor plan
    });

    it('rings up as a sale with no table, still sent to the kitchen', async () => {
        mount();
        fireEvent.click(await takeawayButton());
        fireEvent.click((await screen.findByText(DISH)).closest('button')!);
        fireEvent.click(await screen.findByRole('button', { name: /Send & Settle/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Complete sale/ }));

        await waitFor(async () => expect(await db.sales.count()).toBe(1));
        const [sale] = await db.sales.toArray();
        expect(sale.table_id).toBeNull();
        expect(sale.route_to_kitchen).toBe(true);
        expect(sale.total_cents).toBe(650);
    });

    it('a table order still carries its table', async () => {
        await db.diningTables.bulkPut([table('t1', 'T1')]);
        mount();
        fireEvent.click((await screen.findByText('T1')).closest('button')!);
        // the order is for that table, not a takeaway
        await screen.findByText(DISH);
        expect(screen.getAllByText('Table T1').length).toBeGreaterThan(0);
        expect(screen.queryByText('Takeaway order')).toBeNull();
        fireEvent.click((await screen.findByText(DISH)).closest('button')!);
        fireEvent.click(await screen.findByRole('button', { name: /Send & Settle/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Complete sale/ }));

        await waitFor(async () => expect(await db.sales.count()).toBe(1));
        expect((await db.sales.toArray())[0].table_id).toBe('t1');
    });

    it('starts each takeaway with an empty order', async () => {
        mount();
        fireEvent.click(await takeawayButton());
        fireEvent.click((await screen.findByText(DISH)).closest('button')!);
        expect(await screen.findByRole('button', { name: /1 item/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Takeaway · change/ })); // abandon it, back to the floor plan
        fireEvent.click(await takeawayButton()); // a fresh takeaway
        await screen.findByText(DISH);
        expect(within(document.body).queryByRole('button', { name: /\d+ items?/ })).toBeNull(); // nothing carried over
    });
});
