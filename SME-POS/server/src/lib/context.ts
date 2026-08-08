/**
 * Shared Hono context variables.
 * All middleware write here; all route handlers read here.
 *
 * Types are defined locally rather than imported from the Prisma generated
 * client to avoid rootDir/path issues with the @ts-nocheck generated files.
 */
import type { Session } from 'hono-sessions';

// ── Domain model types (match schema.prisma exactly) ────────────────────────

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  currency: string;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  zimraEnabled: boolean;
  branding: unknown | null;
  nextSkuNumber: number;
  taxRateBps: number;
  nssaRateBps: number;
  nssaCeilingCents: number;
  mode: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  managerId: string | null;
  phone: string | null;
  isActive: boolean;
  mode: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  branchId: string | null;
  name: string;
  email: string;
  role: string;
  monthlySalaryCents: number | null;
  pinHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Device {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  tokenHash: string;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type TenantVar = Tenant & {
  subscription?: {
    status: string;
    zimraAddon: boolean;
    currentPeriodEnd: Date | null;
  } | null;
};

export type DeviceVar = Device & {
  branch: Branch;
};

/**
 * Hono context variable map — declare in your Hono factory:
 *   const app = new Hono<{ Variables: HonoVars }>();
 *
 * `session` is written by hono-sessions' sessionMiddleware and read via
 * ctx.get('session').get('userId') / .set('userId', …) / .deleteSession().
 * NOTE: it is NOT available at (ctx.req.raw as any).session — that property
 * simply does not exist under hono-sessions, which is why the previous auth
 * layer silently authenticated nobody. Always go through ctx.get('session').
 */
export type HonoVars = {
  tenant: TenantVar;
  user: AuthUser;
  device: DeviceVar;
  session: Session;
};
