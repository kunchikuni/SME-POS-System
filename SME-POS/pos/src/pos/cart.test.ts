import { describe, expect, it } from 'vitest';
import {
  addProduct,
  buildSaleMutation,
  cartTotals,
  emptyCart,
  removeLine,
  setQty,
} from '../pos/cart';
import type { Product } from '../types/contract';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.id ?? 'p1',
    category_id: null,
    sku: null,
    barcode: null,
    name: overrides.name ?? 'Coke 500ml',
    price_cents: overrides.price_cents ?? 150,
    currency: 'USD',
    tax_class: overrides.tax_class ?? 'standard',
    type: 'retail',
    track_stock: overrides.track_stock ?? true,
    is_active: true,
  };
}

describe('cart operations', () => {
  it('merges repeated products into one line and bumps qty', () => {
    let cart = emptyCart();
    const p = product();
    cart = addProduct(cart, p);
    cart = addProduct(cart, p);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].qty).toBe(2);
  });

  it('removes a line when quantity drops to zero', () => {
    let cart = addProduct(emptyCart(), product());
    cart = setQty(cart, 'p1', 0);
    expect(cart.lines).toHaveLength(0);
  });

  it('removes a specific line', () => {
    let cart = addProduct(emptyCart(), product({ id: 'p1' }));
    cart = addProduct(cart, product({ id: 'p2', name: 'Bread' }));
    cart = removeLine(cart, 'p1');
    expect(cart.lines.map((l) => l.product.id)).toEqual(['p2']);
  });
});

describe('cart totals', () => {
  it('computes subtotal, total, and item count in integer cents', () => {
    let cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 150 }));
    cart = setQty(cart, 'p1', 2); // 300
    cart = addProduct(cart, product({ id: 'p2', price_cents: 250 })); // 250
    const t = cartTotals(cart);
    expect(t.subtotal_cents).toBe(550);
    expect(t.total_cents).toBe(550); // tax classes default to 0% at MVP
    expect(t.count).toBe(3);
  });
});

describe('buildSaleMutation', () => {
  it('stamps client UUIDs and only assigns movement_id to tracked products', () => {
    let cart = addProduct(emptyCart(), product({ id: 'p1', track_stock: true }));
    cart = addProduct(cart, product({ id: 'p2', name: 'Service', track_stock: false }));

    const mutation = buildSaleMutation(cart, {
      cashierId: 'cashier-1',
      currency: 'USD',
      payments: [{ method: 'cash', amount_cents: 300 }],
    });

    expect(mutation.type).toBe('sale.create');
    expect(mutation.sale.id).toMatch(UUID_RE);
    expect(mutation.sale.cashier_id).toBe('cashier-1');
    expect(new Date(mutation.sale.occurred_at).toString()).not.toBe('Invalid Date');

    const [tracked, untracked] = mutation.sale.lines;
    expect(tracked.id).toMatch(UUID_RE);
    expect(tracked.movement_id).toMatch(UUID_RE); // tracked → gets a ledger id
    expect(untracked.movement_id).toBeUndefined(); // untracked → none

    expect(mutation.sale.payments[0].id).toMatch(UUID_RE);
    expect(mutation.sale.payments[0].currency).toBe('USD');
  });

  it('produces line totals and a sale total that agree with the cart', () => {
    let cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 150 }));
    cart = setQty(cart, 'p1', 3);
    const totals = cartTotals(cart);
    const mutation = buildSaleMutation(cart, { cashierId: null, currency: 'USD', payments: [] });

    expect(mutation.sale.lines[0].line_total_cents).toBe(450);
    expect(mutation.sale.total_cents).toBe(totals.total_cents);
  });

  it('defaults to retail: no table, no gratuity', () => {
    const cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 150 }));
    const { sale } = buildSaleMutation(cart, { cashierId: null, currency: 'USD', payments: [] });
    expect(sale.table_id).toBeNull();
    expect(sale.gratuity_cents).toBe(0);
    expect(sale.total_cents).toBe(150);
  });

  it('carries table and gratuity, folding the tip into the total', () => {
    const cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 1000 }));
    const { sale } = buildSaleMutation(cart, {
      cashierId: 'c1',
      currency: 'USD',
      payments: [{ method: 'card', amount_cents: 1150 }],
      tableId: 'table-7',
      gratuityCents: 150,
    });
    expect(sale.table_id).toBe('table-7');
    expect(sale.gratuity_cents).toBe(150);
    expect(sale.subtotal_cents).toBe(1000);
    expect(sale.total_cents).toBe(1150); // subtotal + tax(0) + gratuity
  });
});
