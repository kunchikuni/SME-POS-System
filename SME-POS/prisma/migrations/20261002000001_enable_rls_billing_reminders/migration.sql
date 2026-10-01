-- Row Level Security for billing_reminders.
--
-- The table (20261001000001_billing_reminders) holds a tenant_id, but it was
-- added after both earlier RLS migrations (20260805000001_enable_rls and
-- 20260930000001_enable_rls_customers) and was left out, so on Supabase it would
-- be readable through the auto-generated public REST API. Same mechanism and
-- caveats as those: RLS enabled with zero policies denies every role subject to
-- RLS, while the application's own connection (table owner / BYPASSRLS) is
-- unaffected — the reminder job runs on that connection.
--
-- Run it after the table exists (after `prisma db push`, or after
-- 20261001000001_billing_reminders). Idempotent — safe to run twice.

ALTER TABLE "billing_reminders" ENABLE ROW LEVEL SECURITY;
