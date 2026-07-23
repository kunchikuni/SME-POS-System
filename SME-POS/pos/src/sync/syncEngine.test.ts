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
import { getSession, saveSession } from '../sync/session';
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
  vi.restoreAllMocks(); // undo vi.spyOn(syncManager, 'sync') etc. — clearAllMocks alone doesn't
  localStorage.clear();
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
      tenantRateBps: 0,
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
      staff: [],
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

  /**
   * Regression: pull() originally never touched staff at all, so a newly
   * added cashier never reached an already-paired till. Fixing that exposed a
   * second gap — deactivating a cashier is a soft-delete, which a naive
   * "just add staff to pull" fix would silently exclude, leaving their PIN
   * working offline forever. The server ships a `removed` tombstone for that
   * case; this proves the client actually acts on it.
   */
  it('adds new staff and revokes deactivated staff via the removed tombstone', async () => {
    await db.staff.bulkPut([
      { id: 'u1', name: 'Tariro', role: 'cashier', pin_hash: 'hash1' },
      { id: 'u2', name: 'Grace', role: 'manager', pin_hash: 'hash2' },
    ]);
    await setCursor('t0');

    const changes: PullResponse = {
      cursor: 't1',
      categories: [],
      products: [],
      stock: [],
      tables: [],
      staff: [
        { id: 'u3', name: 'New Cashier', role: 'cashier', pin_hash: 'hash3', removed: false },
        { id: 'u2', name: 'Grace', role: 'manager', pin_hash: 'hash2', removed: true }, // deactivated
      ],
    };
    vi.mocked(api.pull).mockResolvedValue(changes);

    await syncManager.pull();

    expect(await db.staff.get('u1')).toBeDefined(); // untouched
    expect(await db.staff.get('u3')).toBeDefined(); // newly added
    expect(await db.staff.get('u2')).toBeUndefined(); // revoked — PIN can no longer match
  });
});

/**
 * Regression for "restaurant mode not appearing": saveSession() previously
 * ran only once, at pairing. An owner switching a branch's mode (or
 * changing currency/tax rate) in the dashboard had no way to ever reach an
 * already-paired till — isRestaurant() would read the same stale snapshot
 * forever. sync() now refreshes session info on every cycle; these prove the
 * full wiring, not just the pure mergeSessionInfo() function tested in
 * session.test.ts.
 */
describe('syncManager.sync — tenant info refresh', () => {
  const session = () => ({
    token: 'demo-token',
    device: { id: 'd1', name: 'Till 1' },
    branch: { id: 'b1', name: 'Main', mode: 'retail' as const },
    tenant: { name: 'Demo Store', theme: {}, currency: 'USD', taxRateBps: 1500 },
  });

  beforeEach(async () => {
    await setCursor('t0'); // sync()/pull() are no-ops before first bootstrap
    vi.mocked(api.pull).mockResolvedValue({
      cursor: 't0', categories: [], products: [], stock: [], tables: [], staff: [],
    });
  });

  it('updates the stored session when the branch switches to restaurant mode', async () => {
    saveSession(session());
    vi.mocked(api.session).mockResolvedValue({
      ...session(),
      branch: { ...session().branch, mode: 'restaurant' },
    });

    await syncManager.sync();

    expect(getSession()?.branch.mode).toBe('restaurant');
  });

  it('leaves the session untouched when nothing changed', async () => {
    saveSession(session());
    vi.mocked(api.session).mockResolvedValue(session());

    await syncManager.sync();

    expect(getSession()?.branch.mode).toBe('retail');
  });

  it('does not let a failed session refresh break the rest of the sync cycle', async () => {
    saveSession(session());
    vi.mocked(api.session).mockRejectedValue(new Error('network blip'));

    await expect(syncManager.sync()).resolves.toBeUndefined();
    // pull() still ran and the cursor still advanced despite session refresh failing.
    expect(await getCursor()).toBe('t0');
  });
});
