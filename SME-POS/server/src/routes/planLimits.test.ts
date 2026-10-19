import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

/**
 * The plan limits as the routes enforce them: pairing a till and adding a staff
 * account are refused past what the plan allows, with a stable code, and
 * nothing is created. The database is a small in-memory stand-in.
 */
const BRANCH_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const BRANCH_B = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

const mem = vi.hoisted(() => ({
  devices: [] as any[],
  users: [] as any[],
  /** An email the database already has an account for: creating another with it hits the unique index. */
  takenEmail: null as string | null,
}));

vi.mock('../lib/db.js', () => ({
  db: {
    branch: {
      findFirst: async ({ where }: any) =>
        // The onboarding route asks for "the default branch" (no id); the devices route asks for one by id.
        where.id === undefined ? { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', name: 'Main' }
        : where.id === '3f2504e0-4f89-41d3-9a0c-0305e82c3301' || where.id === '6ba7b810-9dad-41d1-80b4-00c04fd430c8' ? { id: where.id } : null,
    },
    device: {
      // Honour the query as written: a caller that forgets to leave out removed tills counts them.
      count: async ({ where }: any) =>
        mem.devices.filter((d) => d.branchId === where.branchId && (where.deletedAt === null ? d.deletedAt === null : true)).length,
      create: async ({ data }: any) => { mem.devices.push({ ...data, deletedAt: null }); return data; },
    },
    user: {
      count: async ({ where }: any) => mem.users.filter((u) => (where.deletedAt === null ? u.deletedAt === null : true)).length,
      create: async ({ data }: any) => {
        if (mem.takenEmail && data.email === mem.takenEmail) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        mem.users.push({ ...data, deletedAt: null });
        return data;
      },
      findFirst: async ({ where }: any) => mem.users.find((u) => u.id === where.id) ?? null,
      update: async ({ where, data }: any) => { Object.assign(mem.users.find((u) => u.id === where.id), data); return {}; },
    },
  },
}));

// Hashing a PIN or password is real work (it is meant to be); these tests add dozens of accounts and don't test it.
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed', compare: async () => true } }));

const { deviceRoutes } = await import('./devices.js');
const { staffRoutes } = await import('./staff.js');
const { onboardingRoutes } = await import('./onboarding.js');

const DAY = 86_400_000;
const tenantOn = (plan: string, trialEndsInDays?: number) =>
  trialEndsInDays !== undefined
    ? { id: 't1', plan: 'trial', trialEndsAt: new Date(Date.now() + trialEndsInDays * DAY), subscription: null }
    : {
        id: 't1', plan, trialEndsAt: null,
        subscription: { status: 'active', zimraAddon: false, currentPeriodEnd: new Date(Date.now() + 20 * DAY) },
      };

function appFor(tenant: any, role = 'owner') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    (c as any).set('tenant', tenant);
    (c as any).set('user', { id: 'u-owner', role });
    await next();
  });
  app.route('/devices', deviceRoutes);
  app.route('/staff', staffRoutes);
  app.route('/onboarding', onboardingRoutes);
  return app;
}

const post = (app: Hono, path: string, body: unknown = {}) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const pair = (app: Hono, branchId: string, name = 'Counter') => post(app, '/devices', { name, branchId });
const addStaff = (app: Hono, n: number, role = 'cashier') => post(app, '/staff', { name: `Staff ${n}`, role, email: role === 'cashier' || role === 'waiter' ? undefined : `s${n}@shop.test` });

beforeEach(() => {
  mem.takenEmail = null;
  mem.devices = [];
  mem.users = [{ id: 'u-owner', role: 'owner', deletedAt: null }]; // every business has its owner
});

describe('pairing a till', () => {
  it('BYOD gets one: the second is refused with the plan-limit code, and nothing is created', async () => {
    const app = appFor(tenantOn('byod'));
    expect((await pair(app, BRANCH_A, 'Front')).status).toBe(201);

    const second = await pair(app, BRANCH_A, 'Back');
    expect(second.status).toBe(403);
    expect(await second.json()).toMatchObject({
      code: 'plan_limit_reached', limit: 'tills', allowed: 1, message: expect.stringContaining('1 till per branch'),
    });
    expect(mem.devices).toHaveLength(1);
  });

  it('Standard gets two in each branch — the limit is per branch, not per business', async () => {
    const app = appFor(tenantOn('standard'));
    expect((await pair(app, BRANCH_A)).status).toBe(201);
    expect((await pair(app, BRANCH_A)).status).toBe(201);
    expect((await pair(app, BRANCH_A)).status).toBe(403); // a third in the same branch
    expect((await pair(app, BRANCH_B)).status).toBe(201); // but the other branch has its own two
    expect(mem.devices).toHaveLength(3);
  });

  it('Premium and a running trial have no limit', async () => {
    for (const tenant of [tenantOn('premium'), tenantOn('trial', 4)]) {
      mem.devices = [];
      const app = appFor(tenant);
      for (let i = 0; i < 6; i++) expect((await pair(app, BRANCH_A)).status).toBe(201);
    }
  });

  it('frees a place when a till is removed', async () => {
    const app = appFor(tenantOn('byod'));
    await pair(app, BRANCH_A);
    expect((await pair(app, BRANCH_A)).status).toBe(403);
    mem.devices[0].deletedAt = new Date(); // removed
    expect((await pair(app, BRANCH_A)).status).toBe(201);
  });

  it('leaves tills a business already has alone — it only stops adding more', async () => {
    // A business that downgraded with three tills paired is over BYOD's one: nothing is removed or refused but new pairing.
    for (let i = 0; i < 3; i++) mem.devices.push({ id: `d${i}`, branchId: BRANCH_A, deletedAt: null });
    expect((await pair(appFor(tenantOn('byod')), BRANCH_A)).status).toBe(403);
    expect(mem.devices).toHaveLength(3);
  });

  it('still says "branch not found" before it says anything about the plan', async () => {
    const res = await pair(appFor(tenantOn('byod')), '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('"Open the till" in the dashboard (onboarding)', () => {
  const openTill = (app: Hono) => post(app, '/onboarding/till');

  it('is held to the same till limit — it was a way round it, making a new till on every click', async () => {
    const app = appFor(tenantOn('byod'));
    expect((await openTill(app)).status).toBe(201);
    const again = await openTill(app);
    expect(again.status).toBe(403);
    expect(await again.json()).toMatchObject({ code: 'plan_limit_reached', limit: 'tills' });
    expect(mem.devices).toHaveLength(1);
  });

  it('counts the tills paired by hand too', async () => {
    const app = appFor(tenantOn('standard'));
    await pair(app, BRANCH_A);
    expect((await openTill(app)).status).toBe(201); // the second
    expect((await openTill(app)).status).toBe(403); // a third
  });

  it('has no limit on Premium', async () => {
    const app = appFor(tenantOn('premium'));
    for (let i = 0; i < 5; i++) expect((await openTill(app)).status).toBe(201);
  });
});

describe('adding a staff account', () => {
  it('BYOD may have the owner plus five staff; the sixth staff account is refused', async () => {
    const app = appFor(tenantOn('byod'));
    for (let i = 1; i <= 5; i++) expect((await addStaff(app, i)).status, `staff ${i}`).toBe(201);

    const sixth = await addStaff(app, 6);
    expect(sixth.status).toBe(403);
    expect(await sixth.json()).toMatchObject({
      code: 'plan_limit_reached', limit: 'staff', allowed: 5, message: expect.stringContaining('5 staff accounts besides the owner'),
    });
    expect(mem.users).toHaveLength(6); // the owner and five staff — nothing more was created
  });

  it('Standard may have fifteen', async () => {
    const app = appFor(tenantOn('standard'));
    for (let i = 1; i <= 15; i++) expect((await addStaff(app, i)).status, `staff ${i}`).toBe(201);
    expect((await addStaff(app, 16)).status).toBe(403);
  });

  it('Premium and a running trial have no limit', async () => {
    for (const tenant of [tenantOn('premium'), tenantOn('trial', 4)]) {
      mem.users = [{ id: 'u-owner', role: 'owner', deletedAt: null }];
      const app = appFor(tenant);
      for (let i = 1; i <= 25; i++) expect((await addStaff(app, i)).status).toBe(201);
    }
  });

  it('counts a manager (who signs in to the dashboard) the same as a cashier', async () => {
    const app = appFor(tenantOn('byod'));
    for (let i = 1; i <= 5; i++) await addStaff(app, i, i % 2 ? 'manager' : 'cashier');
    expect((await addStaff(app, 6, 'manager')).status).toBe(403);
  });

  it('is not got round by adding a second "owner": every active login counts', async () => {
    const app = appFor(tenantOn('byod'));
    for (let i = 1; i <= 5; i++) expect((await addStaff(app, i, 'owner')).status).toBe(201);
    expect((await addStaff(app, 6, 'owner')).status).toBe(403);
  });

  it('does not count staff who have been deactivated', async () => {
    const app = appFor(tenantOn('byod'));
    for (let i = 1; i <= 5; i++) await addStaff(app, i);
    expect((await addStaff(app, 6)).status).toBe(403);
    mem.users[1].deletedAt = new Date(); // one of them leaves
    expect((await addStaff(app, 6)).status).toBe(201);
  });

  it('reactivating someone counts like adding them — a full plan refuses it', async () => {
    mem.users = [{ id: 'u-owner', role: 'owner', deletedAt: null }];
    const app = appFor(tenantOn('byod'));
    for (let i = 1; i <= 5; i++) await addStaff(app, i);
    mem.users.push({ id: 'u-old', role: 'cashier', name: 'Old Hand', deletedAt: new Date() });

    const refused = await post(app, '/staff/u-old/restore');
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'plan_limit_reached', limit: 'staff' });
    expect(mem.users.find((u) => u.id === 'u-old').deletedAt).not.toBeNull();

    mem.users[1].deletedAt = new Date(); // make room
    expect((await post(app, '/staff/u-old/restore')).status).toBe(200);
    expect(mem.users.find((u) => u.id === 'u-old').deletedAt).toBeNull();
  });

  it('lets "restore" on someone already active through — it adds nothing', async () => {
    mem.users = [{ id: 'u-owner', role: 'owner', deletedAt: null }];
    const app = appFor(tenantOn('byod'));
    for (let i = 1; i <= 5; i++) await addStaff(app, i);
    mem.users.push({ id: 'u-active', role: 'cashier', name: 'Already Here', deletedAt: null });
    expect((await post(app, '/staff/u-active/restore')).status).toBe(200);
  });

  it('answers a duplicate sign-in email with a clear 422 on the email field, not a 500', async () => {
    mem.takenEmail = 'taken@shop.test';
    const res = await post(appFor(tenantOn('standard')), '/staff', { name: 'Second Manager', role: 'manager', email: 'taken@shop.test' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errors: { email: expect.stringContaining('already uses that email') } });
  });

  it('still refuses a cashier who tries to add staff, before it says anything about the plan', async () => {
    const res = await addStaff(appFor(tenantOn('byod'), 'cashier'), 1);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ message: 'Forbidden.' });
  });
});
