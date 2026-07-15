<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('plan');                          // byod | standard | pro
            $table->string('status')->default('trialing');   // trialing | active | past_due | canceled
            $table->timestamp('current_period_end')->nullable();
            $table->boolean('zimra_addon')->default(false);
            $table->string('provider_ref')->nullable();      // Paynow reference
            $table->timestamps();

            $table->index('tenant_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscriptions');
    }
};
