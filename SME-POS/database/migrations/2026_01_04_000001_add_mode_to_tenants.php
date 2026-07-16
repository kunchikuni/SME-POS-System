<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Restaurant vs retail is a tenant setting, not a fork (docs/ARCHITECTURE.md §1).
 * Everything shares one core; `mode` decides which till flow and whether sales
 * spawn kitchen tickets.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('mode')->default('retail'); // retail | restaurant
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn('mode');
        });
    }
};
