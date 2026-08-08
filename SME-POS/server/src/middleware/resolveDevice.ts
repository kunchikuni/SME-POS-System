import crypto from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';

/**
 * Device bearer token authentication — port of ResolveDevice.php
 *
 * Reads `Authorization: Bearer <token>`, SHA-256 hashes it, and matches
 * against `devices.token_hash`. On success, binds BOTH the device and the
 * tenant to context.
 *
 * The token — NOT the subdomain — is authoritative for POS API requests.
 * This is what makes sync work identically online, offline, or on reconnect.
 *
 * Stateless: no session, no CSRF. All POS API routes (sync/*, pos/session)
 * use this middleware instead of the session-cookie auth used by the dashboard.
 */

/** Only write last_seen_at when it's this stale — a till polling every 30s
 *  was previously issuing one DB write per request per device, forever. */
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

export const resolveDevice = createMiddleware<{ Variables: HonoVars }>(
  async (ctx, next) => {
    const authHeader = ctx.req.header('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return ctx.json({ message: 'Missing device token.' }, 401);
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const device = await db.device.findFirst({
      where: { tokenHash, deletedAt: null },
      include: {
        tenant: {
          include: {
            subscriptions: {
              where: { status: 'active' },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { status: true, zimraAddon: true, currentPeriodEnd: true },
            },
          },
        },
        branch: true,
      },
    });

    if (!device || !device.tenant) {
      return ctx.json({ message: 'Invalid device token.' }, 401);
    }

    // Touch last_seen_at — throttled, and with an error handler. The previous
    // `void db.device.update(...)` had neither: every poll wrote a row, and a
    // transient DB failure on the un-awaited promise became an unhandled
    // rejection, which crashes the Node process by default (v15+). A metrics
    // write must never be able to take the API down.
    const stale =
      !device.lastSeenAt ||
      Date.now() - device.lastSeenAt.getTime() > LAST_SEEN_WRITE_INTERVAL_MS;
    if (stale) {
      db.device
        .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {
          /* best-effort telemetry — never fatal */
        });
    }

    const { subscriptions, ...tenantData } = device.tenant as typeof device.tenant & {
      subscriptions: typeof device.tenant.subscriptions;
    };

    ctx.set('tenant', { ...tenantData, subscription: subscriptions[0] ?? null } as any);
    ctx.set('device', device as any);
    await next();
  },
);
