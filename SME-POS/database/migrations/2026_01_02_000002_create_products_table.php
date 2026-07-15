<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('sku');
            $table->string('barcode')->nullable();
            $table->string('name');
            // Money: integer minor units + currency. Never floats. USD only at
            // launch, but the column keeps multi-currency a feature not a migration.
            $table->integer('price_cents');
            $table->string('currency', 3)->default('USD');
            $table->string('tax_class')->default('standard');
            $table->string('type')->default('retail');   // retail | restaurant
            $table->boolean('track_stock')->default(true); // services don't
            $table->string('image_path')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'sku']);
            $table->index(['tenant_id', 'barcode']);
            $table->index('category_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
