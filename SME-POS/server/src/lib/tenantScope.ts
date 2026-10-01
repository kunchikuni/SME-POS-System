/**
 * Structural tenant isolation — the Node/Prisma equivalent of Eloquent's
 * BelongsToTenant global scope from the Laravel version this was ported
 * from. Prisma has no automatic per-model scoping mechanism; without this,
 * every one of the 16 tenant-scoped models' queries relies entirely on a
 * developer remembering to type `tenantId` into every `where` clause, by
 * hand, in every route file, forever. That's not a testing gap to patch —
 * it's a missing safety net that tests can only ever check after the fact,
 * one case at a time. This makes the mistake structurally hard to make at
 * all: a query on a scoped model with no tenant in context THROWS, rather
 * than silently running unscoped and returning every tenant's data.
 *
 * AsyncLocalStorage carries the current request's tenant id through the
 * whole async call chain without threading it through every function
 * signature — set once by resolveTenant middleware, readable anywhere
 * downstream in that same request, gone once the request completes.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '../generated/prisma/client.js';

export const tenantStorage = new AsyncLocalStorage<string>();

/**
 * Called once, in resolveTenant middleware, after the tenant is resolved.
 *
 * `fn` is awaited INSIDE run(), not just returned from it. Prisma queries are
 * lazy PrismaPromises that only execute when `.then()` is called — returning
 * one straight out of run() meant the caller's `await` triggered execution
 * after the store had already been exited, so the query saw no tenant at all
 * (this is what 500'd every POS /sync/push in resolveDevice).
 */
export function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(tenantId, async () => await fn());
}

/**
 * Escape hatch for the rare legitimate case: a background job, a one-off
 * script, or a cross-tenant admin report that genuinely needs to query a
 * scoped model with no tenant in context. Deliberately named for what it
 * does, not what it's for — so a reviewer sees this in a diff and asks why,
 * rather than reading it as routine.
 */
export function withoutTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(NO_TENANT_SENTINEL, async () => await fn()); // see runWithTenant
}

const NO_TENANT_SENTINEL = '__explicit_no_tenant__';

/** Every Prisma model with a tenantId column — kept in sync with schema.prisma by the
 * accompanying test (tenantScope.test.ts), which fails loudly if the two ever drift. */
export const TENANT_SCOPED_MODELS = new Set([
  'Branch', 'Subscription', 'User', 'Category', 'Product', 'StockMovement',
  'StockLevel', 'Device', 'Sale', 'VoidRequest', 'SaleLine', 'Payment',
  'RestaurantTable', 'KitchenOrder', 'Task', 'FiscalDevice', 'PayrollRun', 'Payslip',
  'Customer', 'CustomerPayment', 'BillingReminder',
]);

const READ_AND_TARGETED_WRITE_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy',
  'update', 'updateMany', 'delete', 'deleteMany',
]);

/**
 * Wraps a PrismaClient so every query on a tenant-scoped model automatically
 * gets `tenantId` injected — into `where` for reads/targeted writes, into
 * `data` for creates. A query attempted with no tenant in AsyncLocalStorage
 * context throws immediately rather than running unscoped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTenantScope(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: 'tenantScope',
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const tenantId = tenantStorage.getStore();
          if (!tenantId) {
            throw new Error(
              `Tenant-scoped query ${model}.${operation} attempted with no tenant in context. ` +
              `If this is a background job or script that genuinely needs cross-tenant access, ` +
              `wrap it explicitly in withoutTenantScope() from tenantScope.ts.`,
            );
          }

          if (tenantId === NO_TENANT_SENTINEL) {
            return query(args); // withoutTenantScope() — deliberate, explicit opt-out
          }

          if (READ_AND_TARGETED_WRITE_OPS.has(operation)) {
            args.where = { ...args.where, tenantId };
          } else if (operation === 'create') {
            args.data = { ...args.data, tenantId };
          } else if (operation === 'createMany') {
            args.data = Array.isArray(args.data)
              ? args.data.map((d: Record<string, unknown>) => ({ ...d, tenantId }))
              : args.data;
          } else if (operation === 'upsert') {
            args.where = { ...args.where, tenantId };
            args.create = { ...args.create, tenantId };
            args.update = { ...args.update, tenantId };
          }

          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}
