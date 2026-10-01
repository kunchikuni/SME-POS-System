-- Void requests: the compensating-event design for ARCHITECTURE.md §5.2.
-- Completed sales stay immutable; voiding appends a new record instead of
-- editing the sale, and (on approval) reversing stock movements instead of
-- deleting the originals.

CREATE TABLE "void_requests" (
    "id"           UUID NOT NULL,
    "tenant_id"    UUID NOT NULL,
    "sale_id"      UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reason"       TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "decided_by"   UUID,
    "decided_at"   TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "void_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "void_requests_sale_id_idx" ON "void_requests"("sale_id");
CREATE INDEX "void_requests_tenant_id_status_created_at_idx"
  ON "void_requests"("tenant_id", "status", "created_at");

-- At most one PENDING request per sale. A plain unique on (sale_id, status)
-- would also block a second *rejected* request for the same sale, which is
-- a legitimate case (staff mis-typed a reason, tries again) — so this has
-- to be a partial index, which Prisma's schema syntax cannot express.
CREATE UNIQUE INDEX "void_requests_one_pending_per_sale"
  ON "void_requests"("sale_id")
  WHERE "status" = 'pending';

ALTER TABLE "void_requests"
  ADD CONSTRAINT "void_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
