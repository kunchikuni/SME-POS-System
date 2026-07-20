<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ZIMRA FDMS device registration state. Field names mirror the ACTUAL Fiscal
 * Device Gateway API Specification v7.2 (fetched directly from zimra.co.zw,
 * not reconstructed from memory — docs/ARCHITECTURE.md §9.2 update).
 *
 * One fiscal device per tenant for the MVP (matches the reference UI); the
 * spec supports one device per branch, which is a natural later extension —
 * branch_id is here now so that extension doesn't need a schema change.
 *
 * private_key/certificate are nullable and unused until device registration
 * (registerDevice + CSR generation) is actually implemented — see
 * FiscalisationService for what's real today vs. deliberately not yet built.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('branch_id')->nullable()->constrained()->nullOnDelete();

            // From the taxpayer's ZIMRA portal registration — entered by the owner.
            $table->unsignedInteger('zimra_device_id')->nullable();
            $table->string('activation_key', 8)->nullable(); // write-only in the UI, never redisplayed
            $table->string('device_serial_no', 20)->nullable();
            $table->string('device_model_name')->default('Wivae POS');
            $table->string('device_model_version')->default('1.0');

            // Populated by verifyTaxpayerInformation (real, wired below) —
            // read-only confirmation that the device ID/key resolve to the
            // taxpayer the owner expects, before anything sensitive happens.
            $table->string('taxpayer_name')->nullable();
            $table->string('taxpayer_tin', 10)->nullable();
            $table->string('vat_number', 9)->nullable();
            $table->string('device_branch_name')->nullable();
            $table->json('device_branch_address')->nullable();
            $table->timestamp('verified_at')->nullable();

            // Populated by registerDevice (NOT yet implemented — see service).
            $table->text('certificate')->nullable();     // X.509 PEM, issued by FDMS
            $table->text('private_key')->nullable();      // encrypted at rest
            $table->timestamp('certificate_valid_till')->nullable();

            // Fiscal day state (NOT yet implemented — see service).
            $table->string('fiscal_day_status')->default('not_registered');
            $table->unsignedInteger('fiscal_day_no')->nullable();
            $table->unsignedBigInteger('receipt_global_no')->nullable();

            $table->string('environment')->default('test'); // test | production
            $table->timestamps();

            $table->unique('tenant_id'); // one device per tenant, for now
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_devices');
    }
};
