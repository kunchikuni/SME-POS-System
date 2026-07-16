<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A restaurant order is still an immutable sale (docs §5.2) — it just carries
 * the table it belongs to and any gratuity. Total = subtotal + tax + gratuity.
 *
 * table_id is intentionally a plain column, not a constrained FK: SQLite (dev)
 * cannot add a foreign key via ALTER TABLE. The relationship is enforced in the
 * app layer; Postgres can add the constraint later if desired.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->uuid('table_id')->nullable()->after('cashier_id');
            $table->integer('gratuity_cents')->default(0)->after('tax_cents');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['table_id', 'gratuity_cents']);
        });
    }
};
