/**
 * Enquiries — port of EnquiryController.php + Mail/BusinessEnquiryReceived.php.
 *
 * "Enquire for a quote" for the Business/Enterprise tiers (neither is a
 * fixed self-serve price, so both land here instead of the real billing
 * flow). The enquiry row is the source of truth; the notification email is
 * best-effort on top of it — see sendEmail()'s docblock and the try/catch
 * below, matching the original's own reasoning: a fresh install with no
 * email provider configured shouldn't turn a working submission into a 500.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { sendEmail } from '../lib/email.js';
import type { HonoVars } from '../lib/context.js';

export const enquiryRoutes = new Hono<{ Variables: HonoVars }>();

const SALES_EMAIL = process.env.SALES_EMAIL;

enquiryRoutes.post('/enquire', async (ctx) => {
  const d = z.object({
    name: z.string().min(1).max(120),
    businessName: z.string().min(1).max(120),
    email: z.string().email().max(190),
    phone: z.string().max(30).nullable().optional(),
    message: z.string().max(2000).nullable().optional(),
  }).parse(await ctx.req.json());

  const enquiry = await db.enquiry.create({
    data: {
      id: crypto.randomUUID(),
      name: d.name,
      businessName: d.businessName,
      email: d.email,
      phone: d.phone ?? null,
      message: d.message ?? null,
    },
  });

  // Best-effort — the enquiry above is already safely stored regardless of
  // whether this succeeds. See lib/email.ts's docblock.
  try {
    if (SALES_EMAIL) {
      await sendEmail({
        to: SALES_EMAIL,
        subject: `New ${packageFromMessage(enquiry.message)} enquiry — ${enquiry.businessName}`,
        html: enquiryEmailHtml(enquiry),
      });
    }
  } catch (err) {
    console.warn('Business enquiry saved but notification email failed to send.', {
      enquiryId: enquiry.id,
      error: err instanceof Error ? err.message : err,
    });
  }

  return ctx.json({ message: "Thanks! We'll be in touch soon." }, 201);
});

/**
 * There's no dedicated `interested_in` column on Enquiry (unlike the
 * original) — the marketing site's enquiry form folds tier context into
 * the message text instead (see marketing/src/islands/EnquiryFlow.tsx's
 * docblock for why). Extracting it back out here keeps the email subject
 * behavior identical to the original despite the schema difference.
 */
function packageFromMessage(message: string | null): string {
  const match = message?.match(/^\[Interested in: (Business|Enterprise)\]/);
  return match ? match[1] : 'General';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type EnquiryRow = { name: string; businessName: string; email: string; phone: string | null; message: string | null; createdAt: Date };

/** Same structure and inline styles as the original emails/business-enquiry.blade.php. */
function enquiryEmailHtml(e: EnquiryRow): string {
  const pkg = packageFromMessage(e.message);
  const submitted = e.createdAt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  // The [Interested in: X] prefix already carries the tier info into the
  // subject line above — stripped here so it isn't shown twice in the body.
  const message = e.message?.replace(/^\[Interested in: (Business|Enterprise)\]\s*/, '') ?? '';

  const phoneRow = e.phone
    ? `<tr><td style="padding: 6px 0; color: #64748b;">Phone</td><td style="padding: 6px 0;">${escapeHtml(e.phone)}</td></tr>`
    : '';
  const messageBlock = message
    ? `<p style="color: #64748b; margin-bottom: 4px; margin-top: 20px;">Message</p><p style="white-space: pre-wrap;">${escapeHtml(message)}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; color: #0f172a; max-width: 480px; margin: 0 auto; padding: 24px;">
<h2 style="margin-bottom: 4px;">New ${escapeHtml(pkg)} enquiry</h2>
<p style="color: #64748b; margin-top: 0;">Submitted ${escapeHtml(submitted)}</p>

<table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
  <tr><td style="padding: 6px 0; color: #64748b; width: 120px;">Name</td><td style="padding: 6px 0;">${escapeHtml(e.name)}</td></tr>
  <tr><td style="padding: 6px 0; color: #64748b;">Business</td><td style="padding: 6px 0;">${escapeHtml(e.businessName)}</td></tr>
  <tr><td style="padding: 6px 0; color: #64748b;">Email</td><td style="padding: 6px 0;"><a href="mailto:${escapeHtml(e.email)}">${escapeHtml(e.email)}</a></td></tr>
  ${phoneRow}
</table>
${messageBlock}
</body>
</html>`;
}
