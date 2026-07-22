<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A short, per-branch, per-day ticket number ("#047") — the primary way the
 * reference Kitchen Display identifies an order, which the UUID id never
 * served. Resets daily (matches real KDS conventions and keeps the number
 * short/memorable) rather than growing forever. Computed as MAX+1 for that
 * branch/day inside the same transaction that creates the ticket
 * (SyncService::applySale) — a display number, not a legal sequence like a
 * fiscal receipt, so a MAX+1 race under real SME kitchen volume is an
 * acceptable tradeoff against the complexity of a hard sequence.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen_orders', function (Blueprint $table) {
            $table->unsignedInteger('ticket_no')->nullable()->after('sale_id');
        });
    }

    public function down(): void
    {
        Schema::table('kitchen_orders', function (Blueprint $table) {
            $table->dropColumn('ticket_no');
        });
    }
};
