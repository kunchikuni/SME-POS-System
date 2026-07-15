<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('subdomain')->unique();
            $table->string('plan')->default('trial');       // trial | byod | standard | pro
            $table->string('status')->default('active');     // active | suspended
            $table->timestamp('trial_ends_at')->nullable();
            $table->boolean('zimra_enabled')->default(false);
            $table->jsonb('branding')->nullable();           // white-label overrides
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
