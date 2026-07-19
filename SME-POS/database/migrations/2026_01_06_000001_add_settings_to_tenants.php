<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * General settings an owner configures once: display currency and the VAT
 * rate applied to standard-rated products. Defaults are inert (0 bps, USD) so
 * a fresh tenant never silently charges tax it never configured — the owner
 * opts in via Settings, matching the "ships at zero until configured"
 * position already recorded in docs/ARCHITECTURE.md §3.
 *
 * Rate is basis points (1500 = 15%) for the same reason money is cents:
 * integer arithmetic, no float drift, consistent with pos/src/lib/tax.ts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('currency', 3)->default('USD')->after('name');
            $table->unsignedInteger('tax_rate_bps')->default(0)->after('currency');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['currency', 'tax_rate_bps']);
        });
    }
};
