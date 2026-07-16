<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The kitchen queue. Derived server-side: when a restaurant tenant pushes a
 * sale, one kitchen_order is created (status 'new'). The kitchen display reads
 * these and advances status; this is operational state and does not round-trip
 * to the till, so the offline hot path is unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kitchen_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('table_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('new');     // new | preparing | ready | served
            $table->timestamp('placed_at');
            $table->timestamp('ready_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'branch_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen_orders');
    }
};
