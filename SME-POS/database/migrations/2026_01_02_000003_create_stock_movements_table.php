<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The inventory ledger. Append-only: every sale, purchase, transfer, and
     * adjustment is one immutable row. Current stock is SUM(delta) per
     * product/branch — see docs/ARCHITECTURE.md §5.1. No row is ever updated
     * or deleted, so two offline sales just insert two rows that sum correctly.
     */
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->uuid('id')->primary(); // client-generated offline
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained()->cascadeOnDelete();
            $table->integer('delta');                 // -1, +50, -3 …
            $table->string('reason');                 // sale | purchase | transfer_in | transfer_out | adjustment | initial
            $table->string('ref')->nullable();        // sale UUID, PO id, transfer id
            $table->timestamp('occurred_at');         // when it happened (may be offline, in the past)
            $table->timestamp('created_at')->nullable(); // when it reached the server

            $table->index(['tenant_id', 'branch_id', 'product_id']);
            $table->index('ref');
            $table->index('occurred_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
