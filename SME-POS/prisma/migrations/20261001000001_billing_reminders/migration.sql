-- Reminders about a trial or paid period running out
-- (server/src/domain/billing/reminders.ts): one row per reminder sent, per
-- channel (email / sms). The unique key is what stops the same reminder going
-- out twice; each channel is claimed and retried on its own.
--
-- Also gives users a mobile number, which is where the SMS reminders go.
--
-- For a database that already exists. A new database gets all of this from
-- `prisma db push`, so there is no need to run this file after one — it is
-- idempotent (IF NOT EXISTS) and harmless if you do.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;

CREATE TABLE IF NOT EXISTS "billing_reminders" (
    "id"         UUID         NOT NULL,
    "tenant_id"  UUID         NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "stage"      TEXT         NOT NULL,
    "channel"    TEXT         NOT NULL DEFAULT 'email',
    "sent_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_reminders_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_reminders_tenant_id_period_end_stage_channel_key"
    ON "billing_reminders" ("tenant_id", "period_end", "stage", "channel");
