/**
 * Paynow (Zimbabwe) API client — port of the PaynowService the Laravel app
 * never got around to implementing (billing.ts's subscribe endpoint was a
 * 501 stub).
 *
 * Every detail here — the endpoint URL, the field names, and critically
 * the hash algorithm — was verified against Paynow's own official PHP SDK
 * source (github.com/paynow/Paynow-PHP-SDK) and developer docs
 * (developers.paynow.co.zw), not reconstructed from memory. Getting a
 * payment integration's hash logic subtly wrong is a real security hole,
 * not just a bug — see verifyHash()'s docblock for exactly why.
 *
 * IMPORTANT: Paynow's core API is fundamentally single-payment, not a
 * recurring-subscription product the way Stripe is. There is no "charge
 * this card again next month" call to make. initiateTransaction() starts
 * ONE payment; BYOD's monthly re-billing needs its own scheduled job to
 * call initiateTransaction() again each period and email the customer a
 * new payment link — not built here (no job scheduler is wired into this
 * app yet). What IS built: the full one-time payment flow, which is
 * exactly what activates a subscription today.
 */
import crypto from 'node:crypto';

const INITIATE_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';

const INTEGRATION_ID = process.env.PAYNOW_INTEGRATION_ID;
const INTEGRATION_KEY = process.env.PAYNOW_INTEGRATION_KEY;

export class PaynowNotConfiguredError extends Error {
  constructor() {
    super('PAYNOW_INTEGRATION_ID / PAYNOW_INTEGRATION_KEY are not set.');
  }
}

export class PaynowHashMismatchError extends Error {
  constructor(context: string) {
    super(`Paynow ${context}: hash did not match — message may have been tampered with.`);
  }
}

interface InitiateInput {
  reference: string;
  amount: number; // dollars, e.g. 29.99
  additionalInfo: string;
  authEmail: string;
  returnUrl: string;
  resultUrl: string;
}

interface InitiateResult {
  status: string;
  browserUrl: string;
  pollUrl: string;
}

/**
 * Generates the hash Paynow requires on every outbound message, and that
 * Paynow itself signs every inbound message (webhook, initiate response,
 * poll response) with. Algorithm per developers.paynow.co.zw/docs/paynow/
 * generating_hash/, confirmed identical to the official PHP SDK's
 * Hash::make():
 *   1. Concatenate every field VALUE (excluding "hash" itself) in the
 *      order given, with NO separators and NOT url-encoded.
 *   2. Append the integration key.
 *   3. SHA-512, output as UPPERCASE hex.
 */
function computeHash(fields: Record<string, string>, integrationKey: string): string {
  let concat = '';
  for (const [key, value] of Object.entries(fields)) {
    if (key.toLowerCase() === 'hash') continue;
    concat += value ?? '';
  }
  concat += integrationKey;
  return crypto.createHash('sha512').update(concat, 'utf8').digest('hex').toUpperCase();
}

/**
 * Verifies a message FROM Paynow (webhook, or the initiate/poll response)
 * really came from Paynow and wasn't forged or altered in transit.
 *
 * This is the single most important function in this file. Skipping it
 * (or getting it wrong) means anyone who can guess or intercept a
 * `reference` value could POST a fake "Paid" status to the webhook and
 * activate a subscription for free — this is the ONLY thing standing
 * between "customer paid" and "customer says they paid."
 */
export function verifyHash(fields: Record<string, string>, context: string): void {
  if (!INTEGRATION_KEY) throw new PaynowNotConfiguredError();
  const received = fields.hash ?? fields.Hash;
  if (!received) throw new PaynowHashMismatchError(`${context} (no hash present)`);
  const expected = computeHash(fields, INTEGRATION_KEY);
  if (expected !== received.toUpperCase()) {
    throw new PaynowHashMismatchError(context);
  }
}

/** Paynow's responses are application/x-www-form-urlencoded text, not JSON. */
function parseFormResponse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.trim().split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? '' : pair.slice(eq + 1);
    out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return out;
}

/**
 * Starts one payment. Returns the URL to redirect the customer's browser
 * to (browserUrl) and a pollUrl for later status checks. Does NOT confirm
 * payment — that only happens via the webhook (routes/billing.ts) or an
 * explicit poll, since the customer hasn't paid anything yet at this point.
 */
export async function initiateTransaction(input: InitiateInput): Promise<InitiateResult> {
  if (!INTEGRATION_ID || !INTEGRATION_KEY) throw new PaynowNotConfiguredError();

  // Field order matches the official SDK's formatInit() exactly -- order
  // matters for the hash, since it's a plain concatenation.
  const fields: Record<string, string> = {
    resulturl: input.resultUrl,
    returnurl: input.returnUrl,
    reference: input.reference,
    amount: input.amount.toFixed(2),
    id: INTEGRATION_ID,
    additionalinfo: input.additionalInfo,
    authemail: input.authEmail,
    status: 'Message',
  };
  fields.hash = computeHash(fields, INTEGRATION_KEY);

  const res = await fetch(INITIATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });

  if (!res.ok) {
    throw new Error(`Paynow initiate request failed: HTTP ${res.status}`);
  }

  const parsed = parseFormResponse(await res.text());

  if (parsed.status?.toLowerCase() !== 'ok') {
    throw new Error(`Paynow rejected the initiate request: ${parsed.error ?? parsed.status ?? 'unknown error'}`);
  }

  // The response itself is hash-signed too -- verify it wasn't tampered
  // with in transit before trusting the browserUrl we're about to send
  // the customer to (a forged response could redirect them anywhere).
  verifyHash(parsed, 'initiate response');

  return {
    status: parsed.status,
    browserUrl: parsed.browserurl,
    pollUrl: parsed.pollurl,
  };
}

/** Is this a Paynow address? A poll URL comes out of Paynow's own (hash-verified) reply, but it is still fetched by our server, so it only ever goes to Paynow. */
function isPaynowUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'paynow.co.zw' || u.hostname.endsWith('.paynow.co.zw'));
  } catch {
    return false;
  }
}

/**
 * Asks Paynow where one payment stands, using the pollUrl it gave when the
 * payment was started. The answer is the same message the webhook carries (status,
 * reference, ...) and is hash-verified the same way -- a forged answer can no
 * more mark a payment paid than a forged webhook can.
 *
 * This is the fallback for a webhook that never arrived; see
 * domain/billing/activation.ts. It throws if Paynow can't be reached or the
 * answer doesn't verify, so the caller can leave the payment pending and retry.
 */
export async function pollTransaction(pollUrl: string): Promise<{ status: string; reference: string | null }> {
  if (!INTEGRATION_KEY) throw new PaynowNotConfiguredError();
  if (!isPaynowUrl(pollUrl)) throw new Error('Refusing to poll a URL that is not Paynow\'s.');

  const res = await fetch(pollUrl, { method: 'POST', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Paynow poll request failed: HTTP ${res.status}`);

  const parsed = parseFormResponse(await res.text());
  verifyHash(parsed, 'poll response');
  return { status: parsed.status ?? '', reference: parsed.reference ?? null };
}

/** True if a Paynow status string means money has actually been received.
 *  "Awaiting Delivery" is included deliberately: for a physical-goods
 *  integration it means "paid, not yet marked shipped," but for a digital
 *  product like a subscription there is no shipping step, so it means the
 *  same thing as "Paid" here. */
export function isPaidStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'paid' || s === 'awaiting delivery';
}
