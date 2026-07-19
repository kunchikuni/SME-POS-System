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

describe('cart totals — VAT inclusive (docs/ARCHITECTURE.md §3)', () => {
  it('at 0% tenant rate: total is just the sum of shelf prices, no VAT line', () => {
    let cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 150 }));
    cart = setQty(cart, 'p1', 2); // 300
    cart = addProduct(cart, product({ id: 'p2', price_cents: 250 })); // 250
    const t = cartTotals(cart, 0);
    expect(t.total_cents).toBe(550);
    expect(t.tax_cents).toBe(0);
    expect(t.subtotal_cents).toBe(550); // net === total when rate is 0
    expect(t.count).toBe(3);
  });

  it('reproduces the reference receipt exactly: $11.49 total -> $9.99 net + $1.50 VAT at 15%', () => {
    // $1.50 + $5.99 + $2.50 = $9.99 net... but shelf prices are INCLUSIVE, so
    // set price_cents such that the gross total is $11.49 at 15%.
    let cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 150 }));
    cart = addProduct(cart, product({ id: 'p2', price_cents: 599 }));
    cart = addProduct(cart, product({ id: 'p3', price_cents: 400 }));
    const t = cartTotals(cart, 1500);
    expect(t.total_cents).toBe(1149); // sum of shelf (inclusive) prices — unchanged by tax
    expect(t.subtotal_cents).toBe(999); // net backed out
    expect(t.tax_cents).toBe(150); // VAT backed out
    expect(t.subtotal_cents + t.tax_cents).toBe(t.total_cents); // always reconciles exactly
  });

  it('zero and exempt tax classes never carry VAT, even at a positive tenant rate', () => {
    let cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 1000, tax_class: 'zero' }));
    cart = addProduct(cart, product({ id: 'p2', price_cents: 1000, tax_class: 'exempt' }));
    const t = cartTotals(cart, 1500);
    expect(t.tax_cents).toBe(0);
    expect(t.subtotal_cents).toBe(t.total_cents);
  });

  it('a mixed cart only taxes the standard-rated line', () => {
    let cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 1150, tax_class: 'standard' }));
    cart = addProduct(cart, product({ id: 'p2', price_cents: 500, tax_class: 'zero' }));
    const t = cartTotals(cart, 1500);
    expect(t.total_cents).toBe(1650);
    expect(t.tax_cents).toBe(150); // only from p1: 1150 * 15/115 = 150
    expect(t.subtotal_cents).toBe(1500);
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
      tenantRateBps: 0,
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
    const totals = cartTotals(cart, 1500);
    const mutation = buildSaleMutation(cart, {
      cashierId: null,
      currency: 'USD',
      payments: [],
      tenantRateBps: 1500,
    });

    expect(mutation.sale.lines[0].line_total_cents).toBe(450);
    expect(mutation.sale.total_cents).toBe(totals.total_cents);
    expect(mutation.sale.subtotal_cents).toBe(totals.subtotal_cents);
    expect(mutation.sale.tax_cents).toBe(totals.tax_cents);
  });

  it('defaults to retail: no table, no gratuity', () => {
    const cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 150 }));
    const { sale } = buildSaleMutation(cart, {
      cashierId: null,
      currency: 'USD',
      payments: [],
      tenantRateBps: 0,
    });
    expect(sale.table_id).toBeNull();
    expect(sale.gratuity_cents).toBe(0);
    expect(sale.total_cents).toBe(150);
  });

  it('carries table and gratuity, folding the tip into the total on top of the (already-inclusive) shelf total', () => {
    const cart = addProduct(emptyCart(), product({ id: 'p1', price_cents: 1000 }));
    const { sale } = buildSaleMutation(cart, {
      cashierId: 'c1',
      currency: 'USD',
      payments: [{ method: 'ecocash', amount_cents: 1150 }],
      tableId: 'table-7',
      gratuityCents: 150,
      tenantRateBps: 0,
    });
    expect(sale.table_id).toBe('table-7');
    expect(sale.gratuity_cents).toBe(150);
    expect(sale.subtotal_cents).toBe(1000);
    expect(sale.total_cents).toBe(1150); // shelf total(1000) + tax(0) + gratuity(150)
  });
});
