/**
 * Minimal email sending — Resend's API, called directly via fetch (no SDK
 * dependency; their REST API is a single POST with a bearer token, simple
 * enough not to warrant a new dependency for it).
 *
 * Provider choice: Resend, because it needed picking and this is a
 * reasonable, common default for a Node app — not a requirement from
 * anyone. Swapping providers later means editing sendEmail() here only;
 * every call site just calls sendEmail(), unaware of Resend specifically.
 *
 * Fails soft by design: every call site awaits this INSIDE a try/catch and
 * treats a failure as best-effort-notification-lost, not a request
 * failure. An enquiry (or whatever else emails later) is already durably
 * saved to the database before an email is ever attempted — losing the
 * notification is a real problem worth logging, but it must never be the
 * reason a user-facing request fails.
 */

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Wivae <notifications@wivae.test>';

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (!RESEND_API_KEY) {
    // Not configured yet — log once per call rather than crash the request
    // that triggered it. See routes/enquiries.ts for the calling pattern.
    console.warn(`sendEmail: RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`sendEmail: Resend API returned ${res.status}: ${body}`);
  }
}
