/**
 * Attempt limiting for the endpoints anyone on the internet can reach:
 * sign-in, sign-up, the workspace lookup, the enquiry form and the sign-up
 * hand-off. Before this nothing throttled anything, so a workspace's login
 * could be brute-forced, /register could be spammed into thousands of tenants,
 * and /tenant-lookup could be used to list every workspace.
 *
 * In-memory, fixed window, per process. That's right for the single server
 * instance this app runs as; with several instances each would keep its own
 * counts (the limits then multiply by the instance count) — move the counters
 * to Redis (ioredis is already a dependency) if it's ever scaled out.
 */
import type { Context, MiddlewareHandler } from 'hono';

interface Entry { count: number; resetAt: number }

/** Counts events per key over a fixed window. */
export class WindowCounter {
  private entries = new Map<string, Entry>();

  constructor(private windowMs: number) {
    // Forget expired keys so the map can't grow without bound.
    setInterval(() => {
      const now = Date.now();
      for (const [k, e] of this.entries) if (e.resetAt <= now) this.entries.delete(k);
    }, Math.max(windowMs, 60_000)).unref();
  }

  /** Current count for the key (0 if none or expired) and seconds until it clears. */
  peek(key: string): { count: number; retryAfterSec: number } {
    const e = this.entries.get(key);
    if (!e || e.resetAt <= Date.now()) return { count: 0, retryAfterSec: 0 };
    return { count: e.count, retryAfterSec: Math.ceil((e.resetAt - Date.now()) / 1000) };
  }

  /** Records one event. */
  hit(key: string): { count: number; retryAfterSec: number } {
    const now = Date.now();
    const e = this.entries.get(key);
    if (!e || e.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return { count: 1, retryAfterSec: Math.ceil(this.windowMs / 1000) };
    }
    e.count += 1;
    return { count: e.count, retryAfterSec: Math.ceil((e.resetAt - now) / 1000) };
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}

/**
 * The caller's IP address.
 *
 * X-Forwarded-For is whatever the client chose to send, plus one entry added
 * by each proxy the request really passed through. So only the entry at the
 * position our own platform appended can be trusted: TRUSTED_PROXY_HOPS is how
 * many proxies sit in front of this server (Railway's edge = 1, the default;
 * Cloudflare in front of Railway = 2), counted from the right. Reading the
 * leftmost entry instead would let anyone dodge every limit by sending a
 * different fake address each time. With no header, it's the socket's address.
 */
export function clientIp(ctx: Context): string {
  const hops = Math.max(parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1, 1);
  const forwarded = ctx.req.header('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    const trusted = parts[parts.length - hops];
    if (trusted) return trusted;
  }
  const incoming = (ctx.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

/** 429 body in the { message } shape the dashboard already displays. */
export function tooManyRequests(ctx: Context, retryAfterSec: number, what: string) {
  const minutes = Math.ceil(retryAfterSec / 60);
  ctx.header('Retry-After', String(retryAfterSec));
  return ctx.json(
    {
      message: `Too many ${what}. Please try again in ${minutes <= 1 ? 'a minute' : `${minutes} minutes`}.`,
      retryAfter: retryAfterSec,
    },
    429,
  );
}

/** RATE_LIMIT_DISABLED=1 switches every limit off (load tests, local debugging). */
const disabled = () => process.env.RATE_LIMIT_DISABLED === '1';

/** Limit `max` requests per `windowMs` per client IP, on the given methods (default: all). */
export function rateLimit(opts: { name: string; windowMs: number; max: number; what: string; methods?: string[] }): MiddlewareHandler {
  const counter = new WindowCounter(opts.windowMs);
  return async (ctx, next) => {
    if (disabled() || (opts.methods && !opts.methods.includes(ctx.req.method))) return next();
    const { count, retryAfterSec } = counter.hit(`${opts.name}:${clientIp(ctx)}`);
    if (count > opts.max) return tooManyRequests(ctx, retryAfterSec, opts.what);
    return next();
  };
}

/** Failed sign-ins per (workspace + email + IP): the attacker's address gets locked, not the account owner. */
export const LOGIN_FAILURE_LIMIT = 6;
export const loginFailures = new WindowCounter(15 * 60_000);
export const rateLimitsDisabled = disabled;
