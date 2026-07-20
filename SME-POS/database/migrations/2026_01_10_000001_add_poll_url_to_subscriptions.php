<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paynow's poll URL for the current pending/active payment. Stored so the
 * webhook handler can re-fetch authoritative status directly from Paynow
 * (PaynowService::checkStatus -> SDK pollTransaction) rather than trusting
 * the incoming webhook body's hash — see PaynowService docblock for why.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->string('poll_url')->nullable()->after('provider_ref');
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn('poll_url');
        });
    }
};
