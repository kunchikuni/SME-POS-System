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
 * is that flow's landing spot instead. `interested_in` records which one.
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
            // Which tier prompted the enquiry — 'business' or 'enterprise'.
            // Nullable: the enquiry flow works even if a future entry point
            // doesn't know which tier to attribute (e.g. a generic contact
            // link), rather than forcing every caller to supply one.
            $table->string('interested_in')->nullable();
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
