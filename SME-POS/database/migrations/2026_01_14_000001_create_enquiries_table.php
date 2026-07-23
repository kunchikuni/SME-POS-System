<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Business and Enterprise tier enquiries — captured on the root marketing
 * domain, before any tenant exists, so this is deliberately NOT
 * tenant-scoped (no BelongsToTenant; there's nothing to belong to yet).
 * Neither tier is a fixed self-serve price (Business varies with laptop
 * spec and install distance; Enterprise is explicitly bespoke), so neither
 * goes through the same billing flow as BYOD/Standard/Premium — this table
 * is that flow's landing spot instead. See the later
 * 2026_01_15_000001_add_interested_in_to_enquiries migration for the column
 * recording which tier — added separately rather than in here, since this
 * migration may already have run in some environments by the time that
 * need was discovered.
 * Storage is the durable record; a notification email is best-effort on top
 * of it, not a replacement for it — see EnquiryController.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('enquiries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('business_name');
            $table->string('email');
            $table->string('phone')->nullable();
            $table->text('message')->nullable();
            $table->string('status')->default('new'); // new | contacted | closed
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enquiries');
    }
};
