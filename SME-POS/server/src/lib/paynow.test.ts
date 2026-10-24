import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Asking Paynow where a payment stands (pollTransaction). Its answer is trusted
 * exactly as far as it verifies: signed with the integration key, from Paynow's
 * own address. paynow.ts reads its settings when it loads, so each test sets them
 * first and loads a fresh copy.
 */
const KEY = 'test-integration-key';

/** Signs a Paynow message the way Paynow does: SHA-512 of every value in order, then the key, upper-case hex. */
const sign = (fields: Record<string, string>, key = KEY) =>
  crypto.createHash('sha512').update(Object.values(fields).join('') + key, 'utf8').digest('hex').toUpperCase();

const reply = (fields: Record<string, string>, key = KEY) =>
  new URLSearchParams({ ...fields, hash: sign(fields, key) }).toString();

const POLL_URL = 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc-123';

async function load(env: Record<string, string | undefined> = { PAYNOW_INTEGRATION_ID: '1234', PAYNOW_INTEGRATION_KEY: KEY }) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) { if (v === undefined) vi.stubEnv(k, ''); else vi.stubEnv(k, v); }
  return import('./paynow.js');
}

const respond = (status: number, body: string) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => body }));

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('pollTransaction', () => {
  it('returns the status and reference of a correctly signed answer', async () => {
    const { pollTransaction } = await load();
    const fetchMock = respond(200, reply({ reference: 'maint_t1_1_m1', paynowreference: '99', amount: '7.00', status: 'Paid', pollurl: POLL_URL }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await pollTransaction(POLL_URL)).toEqual({ status: 'Paid', reference: 'maint_t1_1_m1' });
    expect(fetchMock).toHaveBeenCalledWith(POLL_URL, expect.objectContaining({ method: 'POST' }));
  });

  it('refuses an answer signed with some other key — a forged "Paid" must not activate anything', async () => {
    const { pollTransaction } = await load();
    vi.stubGlobal('fetch', respond(200, reply({ reference: 'maint_t1_1_m1', status: 'Paid' }, 'the-wrong-key')));
    await expect(pollTransaction(POLL_URL)).rejects.toThrow(/hash did not match/);
  });

  it('refuses an answer with no signature at all', async () => {
    const { pollTransaction } = await load();
    vi.stubGlobal('fetch', respond(200, 'reference=maint_t1_1_m1&status=Paid'));
    await expect(pollTransaction(POLL_URL)).rejects.toThrow(/no hash present/);
  });

  it('refuses an answer whose contents were changed after signing', async () => {
    const { pollTransaction } = await load();
    const genuine = new URLSearchParams(reply({ reference: 'maint_t1_1_m1', status: 'Created' }));
    genuine.set('status', 'Paid'); // tampered: same hash, new status
    vi.stubGlobal('fetch', respond(200, genuine.toString()));
    await expect(pollTransaction(POLL_URL)).rejects.toThrow(/hash did not match/);
  });

  it('only ever talks to Paynow — never an address that merely came out of the database', async () => {
    const { pollTransaction } = await load();
    const fetchMock = respond(200, reply({ status: 'Paid' }));
    vi.stubGlobal('fetch', fetchMock);
    for (const url of [
      'https://evil.example/Interface/CheckPayment/?guid=1',
      'https://paynow.co.zw.evil.example/x',
      'http://www.paynow.co.zw/Interface/CheckPayment/?guid=1', // not https
      'https://localhost:3000/internal',
      'not a url',
      '',
    ]) {
      await expect(pollTransaction(url), url).rejects.toThrow(/not Paynow/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts Paynow\'s own hosts, with or without www', async () => {
    const { pollTransaction } = await load();
    vi.stubGlobal('fetch', respond(200, reply({ reference: 'r', status: 'Paid' })));
    await expect(pollTransaction('https://www.paynow.co.zw/Interface/CheckPayment/?guid=1')).resolves.toBeTruthy();
    await expect(pollTransaction('https://paynow.co.zw/Interface/CheckPayment/?guid=1')).resolves.toBeTruthy();
  });

  it('throws, so the payment stays pending, when Paynow answers with an error', async () => {
    const { pollTransaction } = await load();
    vi.stubGlobal('fetch', respond(502, 'bad gateway'));
    await expect(pollTransaction(POLL_URL)).rejects.toThrow(/HTTP 502/);
  });

  it('says payments are not set up when there is no integration key', async () => {
    const { pollTransaction, PaynowNotConfiguredError } = await load({ PAYNOW_INTEGRATION_ID: '', PAYNOW_INTEGRATION_KEY: '' });
    vi.stubGlobal('fetch', respond(200, ''));
    await expect(pollTransaction(POLL_URL)).rejects.toBeInstanceOf(PaynowNotConfiguredError);
  });

  it('gives a missing reference as null rather than inventing one', async () => {
    const { pollTransaction } = await load();
    vi.stubGlobal('fetch', respond(200, reply({ status: 'Created' })));
    expect(await pollTransaction(POLL_URL)).toEqual({ status: 'Created', reference: null });
  });
});

describe('isPaidStatus', () => {
  it('counts Paid and Awaiting Delivery, in any case, and nothing else', async () => {
    const { isPaidStatus } = await load();
    for (const s of ['Paid', 'paid', 'PAID', 'Awaiting Delivery', 'awaiting delivery']) expect(isPaidStatus(s), s).toBe(true);
    for (const s of ['Created', 'Cancelled', 'Sent', 'Delivered', 'Failed', '']) expect(isPaidStatus(s), s).toBe(false);
  });
});
