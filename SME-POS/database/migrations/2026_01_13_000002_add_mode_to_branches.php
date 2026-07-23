<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Moves `mode` from the tenant to the branch — the architecturally correct
 * home for it. Confirmed real need, not hypothetical: an owner can run a
 * retail store and a restaurant as two branches of the same tenant, and
 * each needs its own permanent mode, not a single tenant-wide flag that
 * changes what every till everywhere shows.
 *
 * `tenants.mode` is left in place (not dropped) — it's now vestigial, kept
 * only because dropping a column other code still references is a bigger,
 * riskier change than leaving an unused one; nothing reads it for gating
 * after this migration. Every existing branch backfills from its tenant's
 * current mode, so nothing an owner already configured changes silently.
 * New branches default to 'retail' and are never assumed to be a
 * restaurant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->string('mode')->default('retail')->after('is_active'); // retail | restaurant
        });

        foreach (DB::table('tenants')->select('id', 'mode')->get() as $tenant) {
            DB::table('branches')->where('tenant_id', $tenant->id)->update(['mode' => $tenant->mode]);
        }
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('mode');
        });
    }
};
