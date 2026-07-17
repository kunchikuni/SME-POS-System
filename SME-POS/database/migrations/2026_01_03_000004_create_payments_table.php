<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How the customer paid, recorded as a label for the merchant's reporting.
 * Wivae does not process this money (docs/ARCHITECTURE.md §1, §9.1) — cash and
 * mobile-money are recorded, never charged, so this works fully offline.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('sale_id')->constrained()->cascadeOnDelete();
            $table->string('method');                  // cash | ecocash | card | other
            $table->integer('amount_cents');
            $table->string('currency', 3)->default('USD');

            $table->index('sale_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
