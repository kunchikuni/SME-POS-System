/**
 * Minimal SMS sending — the sibling of email.ts, with the same contract:
 * called directly over fetch (no SDK), and failures THROW so the caller can
 * decide (the billing reminders release their claim and retry next run).
 *
 * Provider: Twilio, because its API is the one this was written against and it
 * reaches Zimbabwean numbers. It is not the cheap choice — per-message prices to
 * Zimbabwe run roughly from $0.02 (local gateways) to $0.20 (Twilio) — and
 * swapping is meant to be easy: every call site uses sendSms()/smsConfigured()
 * and knows nothing of Twilio, so a different provider is one adapter below and
 * a different SMS_PROVIDER. (An adapter for a local gateway needs that gateway's
 * API docs and a test account; none is wired up yet.)
 *
 * Settings are read at call time, not at import, so they can be changed in a
 * test or between runs without restarting anything.
 *
 *   SMS_PROVIDER             "twilio" (the default and, so far, the only one)
 *   TWILIO_ACCOUNT_SID       both from the Twilio console
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM              the sender: a Twilio number, or an approved alphanumeric sender ID
 *   TWILIO_MESSAGING_SERVICE_SID   alternatively to TWILIO_FROM, a Messaging Service
 */

export interface SendSmsInput {
  /** E.164, e.g. "+263771234567" (see lib/phone.ts). */
  to: string;
  body: string;
}

type Adapter = {
  configured: () => boolean;
  send: (input: SendSmsInput) => Promise<void>;
};

const twilio: Adapter = {
  configured: () =>
    Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID),
    ),

  async send({ to, body }) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const form = new URLSearchParams({ To: to, Body: body });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
    else form.set('From', process.env.TWILIO_FROM!);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`sendSms: Twilio returned ${res.status}: ${text.slice(0, 300)}`);
    }
  },
};

const ADAPTERS: Record<string, Adapter> = { twilio };

const adapter = (): Adapter | null => ADAPTERS[(process.env.SMS_PROVIDER ?? 'twilio').toLowerCase()] ?? null;

/** Whether an SMS provider is set up. Jobs that must not claim work they can't deliver check this first. */
export const smsConfigured = (): boolean => adapter()?.configured() ?? false;

export async function sendSms(input: SendSmsInput): Promise<void> {
  const a = adapter();
  if (!a || !a.configured()) {
    // Not configured: say so rather than pretend it was sent.
    throw new Error('sendSms: no SMS provider is configured.');
  }
  await a.send(input);
}
