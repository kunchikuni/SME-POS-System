import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { HardwareTill } from './HardwareTill';
import { WorkshopTill } from './WorkshopTill';
import { db } from '../db/database';
import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';

/**
 * The Hardware and Workshop tills on a phone.
 *
 * They used to be a fixed-width screen: a 320px order panel beside the product grid, which on a
 * 375px phone left the products a 55px column (cards 26px wide). Like the Retail and Restaurant
 * tills they are now a sidebar from `lg` (1024px) up and, below that, a floating pill that opens
 * the order as a bottom sheet. jsdom has no CSS, so the breakpoint is guarded by the classes that
 * implement it; the behaviour (pill, sheet, charge, new order) is exercised for real.
 */
const session = (mode: string) => ({
    token: 'test-device-token',
    device: { id: 'd1', name: 'Till 1' },
    branch: { id: 'b1', name: 'Main', mode },
    tenant: { name: 'Test Shop', theme: {}, currency: 'USD', taxRateBps: 0 },
}) as unknown as DeviceSession;
const shift = { cashierId: 'u1', cashierName: 'Tariro', role: 'cashier', startedAt: new Date().toISOString() } as unknown as Shift;

const PART = 'Brake pads (set)';

beforeEach(async () => {
    localStorage.clear();
    await Promise.all([db.categories.clear(), db.products.clear(), db.stock.clear(), db.sales.clear(), db.outbox.clear(), db.meta.clear()]);
    await db.products.bulkPut([
        { id: 'p1', category_id: null, sku: 'SKU-1', barcode: null, name: PART, price_cents: 4500, currency: 'USD', tax_class: 'standard', type: 'retail', track_stock: false, is_active: true },
        { id: 'p2', category_id: null, sku: 'SKU-2', barcode: null, name: 'Spark plug', price_cents: 400, currency: 'USD', tax_class: 'standard', type: 'retail', track_stock: false, is_active: true },
    ] as never);
});
afterEach(() => cleanup());

describe.each<[string, ComponentType<{ device: DeviceSession; shift: Shift; onEndShift: () => void }>, string]>([
    ['Hardware', HardwareTill, 'hardware'],
    ['Workshop', WorkshopTill, 'workshop'],
])('%s till on a phone', (_name, Till, mode) => {
    async function mount() {
        const view = render(<Till device={session(mode)} shift={shift} onEndShift={() => {}} />);
        await screen.findByText(PART);
        return view;
    }
    const addPart = () => fireEvent.click(screen.getByText(PART).closest('button')!);
    const pill = () => screen.queryByRole('button', { name: /\d+ items?/ });
    const sheet = (container: HTMLElement) => container.querySelector<HTMLElement>('.fixed.inset-0');

    it('shows the order as a sidebar only from lg up, and as a pill and sheet below that', async () => {
        const { container } = await mount();
        const aside = container.querySelector('aside')!;
        expect(aside.className).toContain('hidden');
        expect(aside.className).toContain('lg:flex');
        expect(aside.className).toContain('w-80'); // still the same 320px panel when it does show

        addPart();
        const p = await screen.findByRole('button', { name: /1 item/ });
        expect(p.className).toContain('lg:hidden');
        fireEvent.click(p);
        expect(sheet(container)!.className).toContain('lg:hidden');
    });

    it('has no pill until something is in the order', async () => {
        const { container } = await mount();
        expect(pill()).toBeNull();
        expect(sheet(container)).toBeNull();
    });

    it('opens the order as a sheet from the pill, with the Charge button inside it', async () => {
        const { container } = await mount();
        addPart();
        fireEvent.click(await screen.findByRole('button', { name: /1 item/ }));
        const s = sheet(container)!;
        expect(within(s).getByRole('button', { name: /^Charge \$45\.00$/ })).toBeTruthy();
        expect(within(s).getByText(PART)).toBeTruthy();
        expect(pill()).toBeNull(); // the pill gives way to the sheet
    });

    it('keeps the payment and Charge button pinned: the sheet is a column that scrolls only its list', async () => {
        const { container } = await mount();
        addPart();
        fireEvent.click(await screen.findByRole('button', { name: /1 item/ }));
        const panel = sheet(container)!.firstElementChild as HTMLElement;
        expect(panel.className).toContain('flex-col');
        expect(panel.className).toContain('max-h-[88dvh]'); // dvh, not vh: a phone browser's address bar shrinks the screen
        const list = within(panel).getByText(PART).closest('.overflow-y-auto');
        expect(list, 'the order lines scroll on their own').not.toBeNull();
        expect(panel.className).not.toContain('overflow-y-auto'); // not the whole sheet, which would carry the Charge button away
    });

    it('gives the sheet finger-sized quantity and remove buttons (small ones only on the desktop sidebar)', async () => {
        const { container } = await mount();
        addPart();
        fireEvent.click(await screen.findByRole('button', { name: /1 item/ }));
        const s = sheet(container)!;
        for (const label of ['−', '+']) {
            const b = within(s).getByRole('button', { name: label });
            expect(b.className).toContain('h-9');
            expect(b.className).toContain('w-9');
            expect(b.className).toContain('lg:h-6'); // back to compact at lg
        }
        expect(within(s).getByRole('button', { name: '✕' }).className).toContain('py-2.5');
    });

    it('closes the sheet when the dark area outside it is tapped, and brings the pill back', async () => {
        const { container } = await mount();
        addPart();
        fireEvent.click(await screen.findByRole('button', { name: /1 item/ }));
        fireEvent.click(sheet(container)!); // the overlay itself
        expect(sheet(container)).toBeNull();
        expect(await screen.findByRole('button', { name: /1 item/ })).toBeTruthy();
    });

    it('does not close when the sheet itself is tapped', async () => {
        const { container } = await mount();
        addPart();
        fireEvent.click(await screen.findByRole('button', { name: /1 item/ }));
        fireEvent.click(within(sheet(container)!).getByText(PART));
        expect(sheet(container)).not.toBeNull();
    });

    it('charges from the sheet, and the next order starts with the sheet closed and no pill', async () => {
        const { container } = await mount();
        addPart();
        fireEvent.click(await screen.findByRole('button', { name: /1 item/ }));
        fireEvent.click(within(sheet(container)!).getByRole('button', { name: /^Charge \$45\.00$/ }));

        const next = await screen.findByRole('button', { name: /New sale/i });
        expect(await db.sales.count()).toBe(1);
        fireEvent.click(next);

        await waitFor(() => expect(screen.getByText(PART)).toBeTruthy()); // back on the product grid
        expect(sheet(container)).toBeNull();
        expect(pill()).toBeNull();
    });

    it('fills the phone screen with dynamic height, so the Charge button is not hidden under the address bar', async () => {
        const { container } = await mount();
        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toContain('h-dvh');
        expect(root.className).not.toContain('h-screen');
    });
});
