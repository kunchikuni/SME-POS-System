<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Decouples kitchen-ticket creation from tenant.mode. Previously
 * SyncService::applySale() created a KitchenOrder for every sale on a
 * restaurant tenant, and NEVER for a retail tenant — a hard, tenant-wide
 * gate. For a genuinely hybrid business (confirmed real need, not a
 * hypothetical: some orders need a table + kitchen ticket, others don't,
 * regularly) that's wrong in both directions: a retail-primary till has no
 * way to occasionally send an order to the kitchen, and a restaurant-primary
 * till can't ring up a quick no-prep sale without one.
 *
 * route_to_kitchen is a per-SALE signal, set by the till based on which
 * checkout action the cashier actually used — not inferred from table_id
 * (a ticket can exist with no table, e.g. a "Counter" kitchen order; see
 * KitchenController's channel field) and not inferred from tenant.mode.
 * tenant.mode still decides which screen a till opens to by default; it's a
 * convenience now, not a hard gate on backend behavior.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->boolean('route_to_kitchen')->default(false)->after('table_id');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('route_to_kitchen');
        });
    }
};
