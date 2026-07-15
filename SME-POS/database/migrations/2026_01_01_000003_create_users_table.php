<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('email');
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('role')->default('cashier'); // owner | manager | cashier | waiter
            $table->string('pin_hash')->nullable();      // hashed till PIN
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();

            // Email is unique per-tenant, not globally: two tenants may share an email.
            $table->unique(['tenant_id', 'email']);
            $table->index('tenant_id');
        });

        // Framework support tables (Fortify sessions, password resets) come from
        // the default Laravel install; kept out of this domain migration.
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
