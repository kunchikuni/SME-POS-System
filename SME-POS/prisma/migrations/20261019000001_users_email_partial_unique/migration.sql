-- A business could have only ONE till-only staff account (cashier / waiter).
--
-- Till-only staff have no email, stored as '', and users had a plain
-- UNIQUE (tenant_id, email) -- so adding a second cashier to a business failed
-- with a unique-constraint error (a 500). Email is now unique within a business
-- only where there is one.
--
-- For a database that already exists. A new database gets the same index from
-- prisma/post-push.sql, so this file is not needed after one -- it is idempotent
-- and harmless if you run it anyway. Existing rows can't conflict: the new index
-- is looser than the one it replaces.

DROP INDEX IF EXISTS "users_tenant_id_email_key";

CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_id_email_key"
  ON "users"("tenant_id", "email")
  WHERE "email" <> '';
