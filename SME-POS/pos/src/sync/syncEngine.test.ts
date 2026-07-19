import { beforeEach, describe, expect, it, vi } from 'vitest';

// Replace only the network layer; keep the real error classes for instanceof.
vi.mock('../sync/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sync/apiClient')>();
  return {
    ...actual,
    api: {
      bootstrap: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      session: vi.fn(),
    },
  };
});

import { api, OfflineError } from '../sync/apiClient';
import { db, getCursor, setCursor } from '../db/database';
import { ack, enqueue, pending } from '../sync/outbox';
import { syncManager } from '../sync/syncManager';
import { completeSale } from '../pos/checkout';
import { buildSaleMutation, addProduct, emptyCart } from '../pos/cart';
import type { BootstrapResponse, Product, PullResponse } from '../types/contract';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.id ?? 'p1',
    category_id: null,
    sku: null,
    barcode: null,
    name: overrides.name ?? 'Coke',
    price_cents: overrides.price_cents ?? 150,
    currency: 'USD',
    tax_class: 'standard',
    type: 'retail',
    track_stock: overrides.track_stock ?? true,
    is_active: overrides.is_active ?? true,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([
    db.categories.clear(),
    db.products.clear(),
    db.stock.clear(),
    db.staff.clear(),
    db.sales.clear(),
    db.outbox.clear(),
    db.meta.clear(),
  ]);
});

describe('outbox', () => {
  it('enqueues and acknowledges by mutation id', async () => {
    const mutation = buildSaleMutation(addProduct(emptyCart(), product()), {
      cashierId: null,
      currency: 'USD',
      payments: [],
      tenantRateBps: 0,
    });
    await enqueue(mutation.sale.id, mutation);
    expect(await pending()).toHaveLength(1);

    await ack([mutation.sale.id]);
    expect(await pending()).toHaveLength(0);
  });
});

describe('completeSale (offline hot path)', () => {
  it('persists the sale, queues it, and decrements stock atomically', async () => {
    // Don't let the fire-and-forget sync run during the assertion.
    vi.spyOn(syncManager, 'sync').mockResolvedValue(undefined);
    await db.stock.put({ product_id: 'p1', quantity: 10 });

    let cart = addProduct(emptyCart(), product({ id: 'p1' }));
    cart = addProduct(cart, product({ id: 'p1' })); // qty 2

    const sale = await completeSale(cart, {
      cashierId: 'c1',
      payments: [{ method: 'cash', amount_cents: 300 }],
    });

    const stored = await db.sales.get(sale.id);
    expect(stored?.sync).toBe('pending');
    expect(await pending()).toHaveLength(1);
    expect((await db.stock.get('p1'))?.quantity).toBe(8); // 10 - 2
  });
});

describe('syncManager.flush', () => {
  it('removes acked entries and marks their sales synced', async () => {
    const mutation = buildSaleMutation(addProduct(emptyCart(), product()), {
      cashierId: null,
      currency: 'USD',
      payments: [],
      tenantRateBps: 0,
    });
    await db.sales.put({ ...mutation.sale, sync: 'pending' });
    await enqueue(mutation.sale.id, mutation);

    vi.mocked(api.push).mockResolvedValue({ acked: [mutation.sale.id], cursor: 't1' });

    await syncManager.flush();

    expect(api.push).toHaveBeenCalledOnce();
    expect(await pending()).toHaveLength(0);
    expect((await db.sales.get(mutation.sale.id))?.sync).toBe('synced');
  });

  it('retains the outbox when offline (no data lost)', async () => {
    const mutation = buildSaleMutation(addProduct(emptyCart(), product()), {
      cashierId: null,
      currency: 'USD',
      payments: [],
      tenantRateBps: 0,
    });
    await enqueue(mutation.sale.id, mutation);

    vi.mocked(api.push).mockRejectedValue(new OfflineError());

    await expect(syncManager.flush()).resolves.toBeUndefined();
    expect(await pending()).toHaveLength(1); // still queued for retry
  });

  it('does nothing (no network call) when the outbox is empty', async () => {
    await syncManager.flush();
    expect(api.push).not.toHaveBeenCalled();
  });
});

describe('syncManager.bootstrap', () => {
  it('replaces the local catalog and sets the cursor', async () => {
    const snapshot: BootstrapResponse = {
      cursor: 't0',
      categories: [{ id: 'c1', name: 'Drinks' }],
      products: [
        {
          id: 'p1',
          category_id: 'c1',
          sku: 'SKU1',
          barcode: null,
          name: 'Coke',
          price_cents: 150,
          currency: 'USD',
          tax_class: 'standard',
          type: 'retail',
          track_stock: true,
        },
      ],
      stock: [{ product_id: 'p1', quantity: 5 }],
      staff: [{ id: 'u1', name: 'Tariro', role: 'cashier', pin_hash: 'x' }],
      tables: [],
    };
    vi.mocked(api.bootstrap).mockResolvedValue(snapshot);

    await syncManager.bootstrap();

    expect(await db.products.count()).toBe(1);
    expect((await db.products.get('p1'))?.is_active).toBe(true); // normalised on ingest
    expect(await db.categories.count()).toBe(1);
    expect((await db.stock.get('p1'))?.quantity).toBe(5);
    expect(await getCursor()).toBe('t0');
  });
});

describe('syncManager.pull', () => {
  it('applies server-authoritative changes and advances the cursor', async () => {
    await db.products.put(product({ id: 'p1', price_cents: 150 }));
    await setCursor('t0');

    const changes: PullResponse = {
      cursor: 't1',
      categories: [],
      products: [product({ id: 'p1', price_cents: 199 })], // price changed on the dashboard
      stock: [{ product_id: 'p1', quantity: 3 }],
      tables: [],
    };
    vi.mocked(api.pull).mockResolvedValue(changes);

    await syncManager.pull();

    expect((await db.products.get('p1'))?.price_cents).toBe(199);
    expect((await db.stock.get('p1'))?.quantity).toBe(3);
    expect(await getCursor()).toBe('t1');
  });

  it('is a no-op before the first bootstrap (no cursor yet)', async () => {
    await syncManager.pull();
    expect(api.pull).not.toHaveBeenCalled();
  });
});
