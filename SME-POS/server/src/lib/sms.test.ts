import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSms, smsConfigured } from './sms.js';

const KEYS = ['SMS_PROVIDER', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'TWILIO_MESSAGING_SERVICE_SID'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
});

const configure = (extra: Record<string, string> = {}) => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM: 'Wivae', ...extra });
};

describe('smsConfigured', () => {
  it('is off until the account, token and a sender are all set', () => {
    expect(smsConfigured()).toBe(false);
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    expect(smsConfigured()).toBe(false);
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    expect(smsConfigured()).toBe(false); // still no sender
    process.env.TWILIO_FROM = 'Wivae';
    expect(smsConfigured()).toBe(true);
  });

  it('accepts a Messaging Service in place of a sender', () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'secret', TWILIO_MESSAGING_SERVICE_SID: 'MGtest' });
    expect(smsConfigured()).toBe(true);
  });

  it('is off for a provider it has no adapter for', () => {
    configure({ SMS_PROVIDER: 'carrier-pigeon' });
    expect(smsConfigured()).toBe(false);
  });
});

describe('sendSms', () => {
  it('posts the message to Twilio, authenticated, as a form', async () => {
    configure();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, text: async () => '{}' }));
    vi.stubGlobal('fetch', fetchMock);

    await sendSms({ to: '+263771234567', body: 'Wivae: hello' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('ACtest:secret').toString('base64')}`);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(form)).toEqual({ To: '+263771234567', From: 'Wivae', Body: 'Wivae: hello' });
  });

  it('sends through a Messaging Service when that is what is set', async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'secret', TWILIO_MESSAGING_SERVICE_SID: 'MGtest' });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, text: async () => '{}' }));
    vi.stubGlobal('fetch', fetchMock);
    await sendSms({ to: '+263771234567', body: 'hi' });
    const form = new URLSearchParams((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(form.get('MessagingServiceSid')).toBe('MGtest');
    expect(form.has('From')).toBe(false);
  });

  it('throws — so the caller can retry — when the provider refuses', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, text: async () => '{"message":"Invalid To"}' })));
    await expect(sendSms({ to: '+1', body: 'x' })).rejects.toThrow(/Twilio returned 400.*Invalid To/);
  });

  it('throws, rather than pretending it sent, when nothing is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendSms({ to: '+263771234567', body: 'x' })).rejects.toThrow(/no SMS provider/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
