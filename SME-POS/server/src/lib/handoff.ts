/**
 * Sign-in hand-off from registration to the new workspace.
 *
 * Registration runs on the central domain; the owner's dashboard lives on
 * {workspace}.domain. The session cookie can't be relied on to cross that
 * gap (in dev the sign-up page may be on localhost, where a .wivae.test
 * cookie is rejected), which used to leave a brand-new owner at a login
 * screen typing the password they'd just chosen. Instead, registration
 * returns a short-lived signed token; the workspace's /welcome page trades
 * it for a normal session.
 *
 * Token = base64url(payload) + "." + HMAC-SHA256(payload, APP_KEY).
 * - Expires 2 minutes after issue.
 * - Bound to one user AND one tenant (checked against the host it's redeemed on).
 * - Single-use: redeemed nonces are remembered until they'd have expired
 *   anyway. That memory is per process — fine for this single-instance
 *   server; a multi-instance deploy would move it to shared storage.
 */
import crypto from 'node:crypto';

const TTL_MS = 2 * 60 * 1000;
const used = new Map<string, number>(); // nonce → expiry (ms)

interface Payload {
    uid: string;
    tid: string;
    exp: number;
    n: string;
}

function key(): string {
    // Same key (and dev fallback) as the session middleware in index.ts.
    return process.env.APP_KEY ?? 'dev-only-key-never-used-in-prod!!';
}

function sign(data: string): string {
    return crypto.createHmac('sha256', key()).update(data).digest('base64url');
}

export function issueHandoff(userId: string, tenantId: string): string {
    const payload: Payload = { uid: userId, tid: tenantId, exp: Date.now() + TTL_MS, n: crypto.randomBytes(16).toString('hex') };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${data}.${sign(data)}`;
}

/** Returns the user id if the token is genuine, unexpired, unused and for this tenant; else null. */
export function redeemHandoff(token: string, tenantId: string): string | null {
    const [data, mac] = token.split('.');
    if (!data || !mac) return null;

    const expected = sign(data);
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let payload: Payload;
    try {
        payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Payload;
    } catch {
        return null;
    }

    const now = Date.now();
    for (const [n, exp] of used) if (exp < now) used.delete(n); // forget expired nonces
    if (payload.exp < now || payload.tid !== tenantId || used.has(payload.n)) return null;

    used.set(payload.n, payload.exp);
    return payload.uid;
}
