<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HR & Payroll (MVP scope: salary-based, not hourly — there's no shift/clock
 * time-tracking system yet, and that's its own feature). A staff member's
 * monthly_salary_cents is nullable: unset means "not on payroll" (till-only
 * cashiers/waiters typically won't be).
 *
 * NSSA is deliberately a tenant-configured rate/ceiling, not hardcoded —
 * secondary sources disagree on the current employee rate (3.5% vs 4.5% seen
 * across sources) and NSSA is a separate authority from ZIMRA that wasn't
 * independently verified. PAYE brackets ARE hardcoded in PayrollService,
 * because those were confirmed from ZIMRA's own PAYE page directly.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->unsignedInteger('nssa_rate_bps')->default(0)->after('tax_rate_bps');
            $table->unsignedInteger('nssa_ceiling_cents')->default(0)->after('nssa_rate_bps');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('monthly_salary_cents')->nullable()->after('role');
        });

        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->date('period_month'); // first day of the paid month
            $table->foreignUuid('run_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'period_month']); // one run per tenant per month
        });

        Schema::create('payslips', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('payroll_run_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->integer('gross_cents');
            $table->integer('paye_cents');
            $table->integer('aids_levy_cents');
            $table->integer('nssa_cents');
            $table->integer('net_cents');
            $table->timestamps();

            $table->index(['tenant_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payslips');
        Schema::dropIfExists('payroll_runs');
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('monthly_salary_cents'));
        Schema::table('tenants', fn (Blueprint $t) => $t->dropColumn(['nssa_rate_bps', 'nssa_ceiling_cents']));
    }
};
