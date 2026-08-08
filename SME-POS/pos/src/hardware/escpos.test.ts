import { describe, expect, it } from 'vitest';
import { columnsFor, encodeReceipt } from './escpos';
import type { ReceiptContext } from './DeviceBridge';

function context(): ReceiptContext {
    return {
        tenantName: 'Demo Store',
        branchName: 'Main',
        branchAddress: '123 Main St',
        branchPhone: '+263 77 123 4567',
        cashierName: 'Tariro',
        receiptRef: 'REF-260101-ABCDEF',
        fiscal: { verified: false, taxpayerTin: null, vatNumber: null },
        sale: {
            id: 's1',
            cashier_id: 'c1',
            table_id: null,
            route_to_kitchen: false,
            subtotal_cents: 450,
            tax_cents: 0,
            gratuity_cents: 0,
            total_cents: 450,
            currency: 'USD',
            occurred_at: new Date('2026-01-01T10:00:00Z').toISOString(),
            lines: [
                {
                    id: 'l1',
                    product_id: 'p1',
                    name: 'Coke 500ml',
                    qty: 2,
                    unit_price_cents: 150,
                    line_total_cents: 300,
                },
                {
                    id: 'l2',
                    product_id: 'p2',
                    name: 'Bread',
                    qty: 1,
                    unit_price_cents: 150,
                    line_total_cents: 150,
                },
            ],
            payments: [{ id: 'pay1', method: 'cash', amount_cents: 450, currency: 'USD' }],
        },
    };
}

describe('escpos encoder', () => {
    it('maps paper widths to column counts', () => {
        expect(columnsFor('58mm')).toBe(32);
        expect(columnsFor('80mm')).toBe(48);
    });

    it('emits a well-formed receipt: init … content … cut', () => {
        const bytes = encodeReceipt(context(), { columns: 32 });
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]); // ESC @ init
        expect(Array.from(bytes.slice(-3))).toEqual([0x1d, 0x56, 0x00]); // GS V 0 cut

        const text = String.fromCharCode(...bytes);
        expect(text).toContain('Demo Store');
        expect(text).toContain('Coke 500ml');
        expect(text).toContain('2 x $1.50');
        expect(text).toContain('TOTAL');
        expect(text).toContain('$4.50');
    });

    it('includes a drawer-kick pulse only when requested', () => {
        const kick = [0x1b, 0x70, 0x00, 0x19, 0xfa].join(',');
        const withDrawer = Array.from(encodeReceipt(context(), { openDrawer: true })).join(',');
        const without = Array.from(encodeReceipt(context(), { openDrawer: false })).join(',');
        expect(withDrawer).toContain(kick);
        expect(without).not.toContain(kick);
    });

    /**
     * Regression: a receipt must never claim more fiscal certainty than is
     * actually true. An unconfigured tenant gets a distinct, actionable
     * message from a configured-but-not-yet-synced one — collapsing these
     * into one generic "not fiscalised" line would hide the real difference
     * between "you haven't set this up" and "this is working as designed,
     * just not synced yet".
     */
    it('shows "not yet fiscalised" with a setup nudge when no fiscal device is configured', () => {
        const text = String.fromCharCode(...encodeReceipt(context()));
        expect(text).toContain('NOT YET FISCALISED');
        expect(text).toContain('Configure ZIMRA in Settings');
        expect(text).not.toContain('PENDING FISCAL SYNC');
    });

    it('shows "pending fiscal sync" instead, once the tenant\u2019s fiscal device is verified', () => {
        const verified: ReceiptContext = {
            ...context(),
            fiscal: { verified: true, taxpayerTin: '1234567890', vatNumber: '123456789' },
        };
        const text = String.fromCharCode(...encodeReceipt(verified));
        expect(text).toContain('PROVISIONAL - PENDING FISCAL SYNC');
        expect(text).toContain('TIN: 1234567890');
        expect(text).toContain('VAT Reg: 123456789');
        expect(text).not.toContain('NOT YET FISCALISED');
    });

    it('includes a tax breakdown line only when the sale actually has VAT', () => {
        const withTax: ReceiptContext = {
            ...context(),
            sale: { ...context().sale, subtotal_cents: 391, tax_cents: 59, total_cents: 450 },
        };
        const taxedText = String.fromCharCode(...encodeReceipt(withTax));
        expect(taxedText).toContain('TAX BREAKDOWN');
        expect(taxedText).toContain('$0.59');

        // The base fixture has tax_cents: 0 — no breakdown section should render.
        const untaxedText = String.fromCharCode(...encodeReceipt(context()));
        expect(untaxedText).not.toContain('TAX BREAKDOWN');
    });

    /**
     * Regression: received_cents previously wasn't captured anywhere, so a
     * receipt could never show change owed even when a cashier entered a cash
     * amount during checkout. Proves both that it prints correctly when
     * present, and — just as important — that it stays absent for an exact
     * (non-cash, or exact-cash) payment rather than printing "Change: $0.00"
     * on every single receipt.
     */
    it('prints amount paid and change when cash received exceeds the total', () => {
        const withChange: ReceiptContext = {
            ...context(),
            sale: {
                ...context().sale,
                payments: [{ id: 'pay1', method: 'cash', amount_cents: 450, received_cents: 500, currency: 'USD' }],
            },
        };
        const text = String.fromCharCode(...encodeReceipt(withChange));
        expect(text).toContain('Amount paid');
        expect(text).toContain('$5.00');
        expect(text).toContain('Change');
        expect(text).toContain('$0.50');
    });

    it('omits amount paid/change for an exact payment or a non-cash tender', () => {
        // Exact cash — no change owed.
        const text = String.fromCharCode(...encodeReceipt(context()));
        expect(text).not.toContain('Amount paid');
        expect(text).not.toContain('Change');
    });
});
