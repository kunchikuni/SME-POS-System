-- Run this once, after `npx prisma db push`.
-- db push only reads schema.prisma, so it creates the void_requests table
-- but not this index — Prisma's schema syntax can't express a partial
-- unique index. See prisma/migrations/20260804000001_add_void_requests/
-- migration.sql for the full original migration (which also has the
-- CREATE TABLE — don't run that one after db push, it'll conflict with
-- the table db push already created).

CREATE UNIQUE INDEX IF NOT EXISTS "void_requests_one_pending_per_sale"
  ON "void_requests"("sale_id")
  WHERE "status" = 'pending';
