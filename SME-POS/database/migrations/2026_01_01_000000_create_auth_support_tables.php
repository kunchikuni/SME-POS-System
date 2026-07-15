<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Restores the two support tables that shipped inside Laravel's default
 * create_users_table migration, which we delete because our `users` table is
 * UUID- and tenant-shaped (see 2026_01_01_000003_create_users_table).
 *
 * Runs early (000000) and has no dependency on `users`, so ordering is safe.
 * `sessions.user_id` is a nullable uuid (no FK) to match our user keys — it's
 * only used if SESSION_DRIVER=database; the shipped default is redis.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('password_reset_tokens', function (Blueprint $table) {
            // NOTE: keyed by email. Emails are unique per-tenant in Wivae, so a
            // shared email across two tenants would collide here. Acceptable for
            // MVP; revisit if cross-tenant email reuse becomes common.
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->uuid('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
    }
};
