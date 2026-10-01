-- Row Level Security for the customer / store-credit tables.
--
-- 20260805000001_enable_rls covered every tenant-scoped table that existed at
-- the time. `customers` and `customer_payments` were added afterwards and were
-- left out, so on Supabase they would be readable through the auto-generated
-- public REST API. Same mechanism and same caveats as that migration: RLS
-- enabled with zero policies denies every role subject to RLS, while the
-- application's own connection (table owner / BYPASSRLS) is unaffected.
--
-- Idempotent — safe to run on a database that already has it.

ALTER TABLE "customers"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_payments" ENABLE ROW LEVEL SECURITY;
