import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TABLE_COUNT, defaultTableRows, ensureDefaultTables } from './restaurant.js';

const T = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('defaultTableRows', () => {
  it('makes T1..T10 for the branch, in order, each with its own id', () => {
    const rows = defaultTableRows(T, B);
    expect(rows).toHaveLength(DEFAULT_TABLE_COUNT);
    expect(DEFAULT_TABLE_COUNT).toBe(10);
    expect(rows.map((r) => r.name)).toEqual(Array.from({ length: 10 }, (_, i) => `T${i + 1}`));
    expect(rows.map((r) => r.sort)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(10);
    for (const r of rows) {
      expect(r.tenantId).toBe(T);
      expect(r.branchId).toBe(B);
    }
  });

  it('makes a different set of ids each time (two branches never share a table id)', () => {
    const a = defaultTableRows(T, B).map((r) => r.id);
    const b = defaultTableRows(T, B).map((r) => r.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });
});

describe('ensureDefaultTables', () => {
  const clientWith = (existing: number) => {
    const count = vi.fn(async (_args: unknown) => existing);
    const createMany = vi.fn(async (_args: unknown) => ({ count: 0 }));
    // only the two methods it uses
    return { client: { restaurantTable: { count, createMany } } as never, count, createMany };
  };

  it('gives a branch with no tables its ten, and says how many', async () => {
    const { client, createMany } = clientWith(0);
    expect(await ensureDefaultTables(client, T, B)).toBe(10);
    expect(createMany).toHaveBeenCalledTimes(1);
    const { data } = createMany.mock.calls[0][0] as { data: { name: string; branchId: string }[] };
    expect(data).toHaveLength(10);
    expect(data.every((r) => r.branchId === B)).toBe(true);
  });

  it('leaves a branch that already has tables exactly as it is', async () => {
    const { client, createMany } = clientWith(3);
    expect(await ensureDefaultTables(client, T, B)).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('counts the branch\'s tables of any kind, removed ones too: tables someone took away on purpose do not come back', async () => {
    const { client, count } = clientWith(0);
    await ensureDefaultTables(client, T, B);
    const where = (count.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual({ tenantId: T, branchId: B }); // no deletedAt / isActive filter
  });
});
