/**
 * Prisma Client singleton — import `db` anywhere to run queries.
 * Prisma v7 requires a driver adapter. We use @prisma/adapter-pg for Postgres.
 *
 * The singleton pattern prevents connection pool exhaustion on hot reloads.
 *
 * Every query through this client is automatically tenant-scoped — see
 * tenantScope.ts for why this exists and what it actually does. This is not
 * optional or per-route; it's applied once, here, to the one client
 * everything imports.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { withTenantScope } from './tenantScope.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
    const adapter = new PrismaPg({ connectionString });
    const client = new PrismaClient({
        adapter,
        log:
            process.env.NODE_ENV === 'development'
                ? ['query', 'warn', 'error']
                : ['warn', 'error'],
    });
    return withTenantScope(client);
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = db;
}
