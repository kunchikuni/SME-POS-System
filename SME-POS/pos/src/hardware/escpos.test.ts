import { describe, expect, it } from 'vitest';
import { columnsFor, encodeReceipt } from './escpos';
import type { ReceiptContext } from './DeviceBridge';

function context(): ReceiptContext {
  return {
    tenantName: 'Demo Store',
    branchName: 'Main',
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
    expect(text).toContain('2 x Coke 500ml');
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
});
