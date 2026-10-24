-- Row Level Security — deny-all tripwire on every tenant-scoped table.
-- ARCHITECTURE.md §7: "RLS as a tripwire. Deny-all RLS policies on tenant
-- tables catch a class of bugs (a query that somehow escapes the global
-- scope), but are not relied on as the gate, because the app's DB role is
-- privileged." This was documented but never actually built until now.
--
-- Mechanism: enabling RLS with ZERO policies denies all access to any role
-- subject to RLS -- no explicit "deny" policy is needed, that's Postgres's
-- default. The app's own connection (DATABASE_URL) is expected to either
-- own these tables (migrations create them) or hold BYPASSRLS, so the
-- application itself is completely unaffected. This does NOT replace
-- Laravel/Node-side authorization (Policies / role checks in routes) --
-- that remains the primary gate. This is the tripwire behind it.
--
-- Why this matters beyond "defense in depth": Supabase auto-generates a
-- public PostgREST API over every table in the public schema by default.
-- Without RLS, if SUPABASE_URL + the anon key were ever used anywhere --
-- even by accident, even briefly during development -- every tenant's
-- products, sales, staff, and payroll data would be queryable over plain
-- HTTP with no authentication at all. RLS is what makes that auto-generated
-- API return nothing instead of everything.
--
-- `tenants` and `enquiries` are intentionally excluded: tenants has no
-- tenant_id (it IS the tenant), and enquiries is deliberately public-facing
-- (the "Business"/"Enterprise" contact form on the marketing page writes to
-- it before any tenant or session exists).

ALTER TABLE "branches"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_levels"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "void_requests"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_lines"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tables"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kitchen_orders"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_devices"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payslips"        ENABLE ROW LEVEL SECURITY;

-- FORCE ROW LEVEL SECURITY is deliberately NOT set on any table. FORCE would
-- apply RLS even to the table owner, which would break the application's own
-- connection unless it explicitly holds BYPASSRLS. Whether Supabase's pooled
-- connection role has BYPASSRLS or table ownership varies by project setup --
-- verify with the query below after applying this migration, and grant
-- BYPASSRLS explicitly if the app's queries start returning zero rows:
--
--   select rolname, rolbypassrls from pg_roles where rolname = current_user;
--   -- if rolbypassrls is false and the role doesn't own these tables:
--   alter role <app_role> bypassrls;
