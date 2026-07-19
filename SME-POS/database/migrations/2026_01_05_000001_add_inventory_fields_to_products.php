<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Inventory fields the dashboard needs (Phase 6.5 · feat/inventory-tools):
 *
 *  - brand           shown on POS product cards ("Coca-Cola", "Bakers Inn")
 *  - cost_cents      what the merchant paid; drives inventory valuation and
 *                    margin. Integer minor units like every other money column.
 *  - low_stock_threshold  per-product reorder point for the "Low Stock" count.
 *
 * All nullable/defaulted so existing rows and the CSV importer keep working.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('brand')->nullable()->after('name');
            $table->integer('cost_cents')->nullable()->after('price_cents');
            $table->unsignedInteger('low_stock_threshold')->default(0)->after('track_stock');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['brand', 'cost_cents', 'low_stock_threshold']);
        });
    }
};
