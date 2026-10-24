import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

/**
 * A restaurant's floor plan needs tables, and nothing else in the product can make them -- so they are made
 * when a restaurant branch comes into being: at sign-up, when a branch is created as a restaurant, and when a
 * branch is switched to restaurant mode. The database is a small in-memory stand-in; its transactions queue on
 * the business lock the way Postgres's `SELECT ... FOR UPDATE` makes them.
 */
const mem = vi.hoisted(() => ({
  branches: [] as any[],
  tables: [] as any[],
  /** Every database write, in the order it was issued. */
  log: [] as string[],
  /** The operations handed to each array-form transaction. */
  transactions: [] as number[],
  tenantsCreated: [] as any[],
  branchesCreated: [] as any[],
}));

vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed', hashSync: () => 'hashed', compare: async () => true } }));

vi.mock('../lib/db.js', () => {
  const branch = {
    count: async () => mem.branches.filter((b) => b.deletedAt === null).length,
    create: async ({ data }: any) => {
      const row = { isActive: true, isDefault: false, ...data, deletedAt: null };
      mem.log.push('branch.create');
      mem.branchesCreated.push(row);
      mem.branches.push(row);
      return row;
    },
    // a read is a snapshot, and a write takes a moment to land: requests in flight together all read the branch as it was
    findFirst: async ({ where }: any) => { const b = mem.branches.find((x) => x.id === where.id && x.deletedAt === null); return b ? { ...b } : null; },
    update: async ({ where, data }: any) => {
      await new Promise((r) => setTimeout(r, 5));
      const b = mem.branches.find((x) => x.id === where.id); Object.assign(b, data); mem.log.push('branch.update'); return { ...b };
    },
    updateMany: async () => ({ count: 0 }),
  };
  const restaurantTable = {
    // every table the branch has ever had, removed ones included (as the real query counts them)
    count: async ({ where }: any) => {
      const n = mem.tables.filter((t) => t.branchId === where.branchId).length;
      await new Promise((r) => setTimeout(r, 5)); // a database takes a moment to answer: requests in flight together all see the same count
      return n;
    },
    createMany: async ({ data }: any) => {
      mem.log.push(`tables:${data.length}`);
      for (const r of data) mem.tables.push({ ...r, deletedAt: null });
      return { count: data.length };
    },
  };
  // Registration's other writes only need to be seen to have happened.
  const seen = (name: string) => async ({ data }: any) => { mem.log.push(name); if (name === 'tenant.create') mem.tenantsCreated.push(data); return data; };
  const tenant = { findUnique: async () => null, create: seen('tenant.create') };
  const category = { createMany: seen('category.createMany') };
  const user = { create: seen('user.create') };

  const queue = new Map<string, Promise<void>>();
  const $transaction = async (arg: any, _options?: unknown) => {
    if (Array.isArray(arg)) { mem.transactions.push(arg.length); return Promise.all(arg); }
    const releases: (() => void)[] = [];
    const $queryRaw = async (_s: TemplateStringsArray, ...values: unknown[]) => {
      const key = String(values[0]);
      const before = queue.get(key) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((r) => { release = r; });
      queue.set(key, before.then(() => mine));
      releases.push(release);
      await before;
      return [{ id: key }];
    };
    try { return await arg({ branch, restaurantTable, $queryRaw }); } finally { releases.forEach((r) => r()); }
  };
  return { db: { branch, restaurantTable, tenant, category, user, $transaction } };
});

const { branchRoutes } = await import('./branches.js');
const { registerRoutes } = await import('./auth.js');

const T1 = '11111111-1111-4111-8111-111111111111';
const tenant = { id: T1, plan: 'premium', mode: 'restaurant', trialEndsAt: null, subscription: { status: 'active', zimraAddon: false, currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000) } };

function app() {
  const a = new Hono();
  a.use('*', async (c, next) => { (c as any).set('tenant', tenant); (c as any).set('user', { id: 'u1', role: 'owner' }); await next(); });
  a.route('/branches', branchRoutes);
  a.route('/', registerRoutes);
  return a;
}
const send = (a: Hono, method: string, path: string, body?: unknown) =>
  a.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const tablesOf = (branchId: string) => mem.tables.filter((t) => t.branchId === branchId);

const BRANCH = '33333333-3333-4333-8333-333333333333';
beforeEach(() => {
  mem.branches = [{ id: BRANCH, tenantId: T1, name: 'Main', mode: 'retail', isActive: true, isDefault: true, deletedAt: null }];
  mem.tables = [];
  mem.log = [];
  mem.transactions = [];
  mem.tenantsCreated = [];
  mem.branchesCreated = [];
});

describe('signing up', () => {
  const signUp = (businessType: string, subdomain = 'shop-' + businessType) =>
    send(app(), 'POST', '/register', { businessName: 'Test Business', ownerName: 'Tendai Moyo', subdomain, businessType, email: 'owner@test.example', password: 'a-long-password', pin: '4821' });

  it('gives a new restaurant its ten tables, on its first branch, in the same transaction as the branch', async () => {
    const res = await signUp('restaurant');
    expect(res.status).toBe(201);
    const branch = mem.branchesCreated[0];
    expect(branch.mode).toBe('restaurant');
    const tables = tablesOf(branch.id);
    expect(tables).toHaveLength(10);
    expect(tables.map((t) => t.name)).toEqual(Array.from({ length: 10 }, (_, i) => `T${i + 1}`));
    expect(new Set(tables.map((t) => t.id)).size).toBe(10);
    expect(tables.every((t) => t.tenantId === mem.tenantsCreated[0].id)).toBe(true);
    // one transaction holding the tenant, branch, categories, owner AND tables: all of it or none of it
    expect(mem.transactions).toEqual([5]);
    expect(mem.log).toEqual(['tenant.create', 'branch.create', 'category.createMany', 'tables:10', 'user.create']);
  });

  it.each(['retail', 'supermarket', 'bottlestore', 'pharmacy', 'clothing', 'butchery', 'hardware', 'workshop', 'salon'])(
    'makes no tables for a %s: it has no floor plan',
    async (type) => {
      expect((await signUp(type)).status).toBe(201);
      expect(mem.tables).toHaveLength(0);
      expect(mem.transactions).toEqual([4]); // tenant, branch, categories, owner
    },
  );
});

describe('adding a branch', () => {
  it('a new restaurant branch gets its ten tables', async () => {
    const res = await send(app(), 'POST', '/branches', { name: 'Patio', mode: 'restaurant' });
    expect(res.status).toBe(201);
    const made = await res.json() as { id: string };
    expect(tablesOf(made.id)).toHaveLength(10);
    expect(mem.log).toEqual(['branch.create', 'tables:10']);
  });

  it.each(['retail', 'hardware', 'workshop'])('a new %s branch gets none', async (mode) => {
    expect((await send(app(), 'POST', '/branches', { name: 'Another', mode })).status).toBe(201);
    expect(mem.tables).toHaveLength(0);
  });
});

describe('switching a branch to restaurant mode', () => {
  const patch = (body: unknown, id = BRANCH) => send(app(), 'PATCH', `/branches/${id}`, body);

  it('gives a branch that never had tables its ten', async () => {
    expect((await patch({ mode: 'restaurant' })).status).toBe(200);
    expect(tablesOf(BRANCH)).toHaveLength(10);
  });

  it('only once: switching away and back does not make a second set', async () => {
    await patch({ mode: 'restaurant' });
    await patch({ mode: 'retail' });
    await patch({ mode: 'restaurant' });
    expect(tablesOf(BRANCH)).toHaveLength(10);
  });

  it('does not bring back tables that were removed on purpose', async () => {
    mem.tables = Array.from({ length: 4 }, (_, i) => ({ id: `old${i}`, tenantId: T1, branchId: BRANCH, name: `Old ${i}`, deletedAt: new Date() }));
    await patch({ mode: 'restaurant' });
    expect(tablesOf(BRANCH)).toHaveLength(4);
    expect(mem.log).not.toContain('tables:10');
  });

  it('leaves a branch that already has its own tables alone', async () => {
    mem.tables = [{ id: 'mine', tenantId: T1, branchId: BRANCH, name: 'Window', deletedAt: null }];
    await patch({ mode: 'restaurant' });
    expect(tablesOf(BRANCH).map((t) => t.name)).toEqual(['Window']);
  });

  it('does nothing for a branch that is already a restaurant, or when something else is edited', async () => {
    mem.branches[0].mode = 'restaurant';
    await patch({ mode: 'restaurant' });
    await patch({ name: 'Renamed' });
    expect(mem.tables).toHaveLength(0);
  });

  it('does nothing when switching to another kind of branch', async () => {
    await patch({ mode: 'hardware' });
    expect(mem.tables).toHaveLength(0);
  });

  it('also works when the same request makes the branch the default one', async () => {
    expect((await patch({ mode: 'restaurant', isDefault: true })).status).toBe(200);
    expect(tablesOf(BRANCH)).toHaveLength(10);
  });

  it('two switches at the same moment still make just one set', async () => {
    const results = await Promise.all([patch({ mode: 'restaurant' }), patch({ mode: 'restaurant' }), patch({ mode: 'restaurant' })]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(tablesOf(BRANCH)).toHaveLength(10);
    expect(new Set(tablesOf(BRANCH).map((t) => t.name)).size).toBe(10); // no duplicate names either
  });
});
