<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cashiers and waiters never get dashboard access — till PIN only, no email,
 * no password (Staff Management decision: dashboard login is Owner/Manager
 * only). The existing unique(tenant_id, email) index is untouched: SQL
 * treats NULL as distinct from every other NULL, so any number of staff can
 * share a NULL email without colliding.
 *
 * TenantUserProvider::retrieveByCredentials additionally excludes NULL-
 * password accounts from login attempts entirely — this migration makes the
 * column nullable, that guard makes it safe.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email')->nullable()->change();
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email')->nullable(false)->change();
            $table->string('password')->nullable(false)->change();
        });
    }
};
