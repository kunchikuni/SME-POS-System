<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A completed sale. Immutable once written (see docs/ARCHITECTURE.md §5.2):
 * corrections are new records, never edits. The UUID is client-generated on the
 * till so an offline sale has a stable identity — and it doubles as the
 * idempotency key on push (a sale that already exists is skipped).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->uuid('id')->primary();                 // client-generated
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('device_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('cashier_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status')->default('completed'); // completed | refunded | voided
            $table->integer('subtotal_cents');
            $table->integer('tax_cents')->default(0);
            $table->integer('total_cents');
            $table->string('currency', 3)->default('USD');
            $table->string('fiscal_status')->default('none'); // none | pending | submitted | failed
            $table->timestamp('occurred_at');              // when rung up (may be offline/past)
            $table->timestamp('synced_at')->nullable();    // when it reached the server
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'branch_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
