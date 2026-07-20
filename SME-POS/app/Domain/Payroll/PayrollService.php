<?php

namespace App\Domain\Payroll;

use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * PAYE brackets below are the confirmed monthly USD structure from ZIMRA's
 * own PAYE page (zimra.co.zw/domestic-taxes/individual/pay-as-you-earn-paye),
 * corroborated independently by a second source, both fetched 2026-07-19 —
 * not from training-data memory. The 3% AIDS levy on calculated PAYE is
 * consistent across every source checked.
 *
 * NSSA is deliberately NOT hardcoded here — secondary sources disagreed on
 * the current employee rate (3.5% vs 4.5% across different sites) and NSSA is
 * administered by a separate authority from ZIMRA that wasn't independently
 * verified. It's a tenant-configured rate/ceiling (Settings, both default to
 * 0/off) rather than a guess between two contradicting numbers.
 *
 * Scope: salary-based payroll only. There's no shift/clock time-tracking
 * system yet, so hourly payroll isn't attempted — that's a distinct feature.
 */
class PayrollService
{
    /** Monthly USD brackets, in cents, as confirmed from ZIMRA. */
    private const BRACKETS = [
        // [ceiling_cents, rate] — 0 rate on first $100, 20% on next $200, etc.
        [10_000, 0.00],   // $0 – $100
        [30_000, 0.20],   // $100 – $300
        [300_000, 0.25],  // $300 – $3,000
        [PHP_INT_MAX, 0.40], // above $3,000
    ];

    public function computePaye(int $grossCents): int
    {
        $tax = 0;
        $lower = 0;

        foreach (self::BRACKETS as [$ceiling, $rate]) {
            if ($grossCents <= $lower) {
                break;
            }
            $slice = min($grossCents, $ceiling) - $lower;
            $tax += (int) round($slice * $rate);
            $lower = $ceiling;
        }

        return $tax;
    }

    public function computeAidsLevy(int $payeCents): int
    {
        return (int) round($payeCents * 0.03);
    }

    public function computeNssa(int $grossCents, Tenant $tenant): int
    {
        $rate = $tenant->nssa_rate_bps ?? 0;
        if ($rate <= 0) {
            return 0;
        }

        $ceiling = $tenant->nssa_ceiling_cents ?: PHP_INT_MAX;
        $insurable = min($grossCents, $ceiling);

        return (int) round($insurable * $rate / 10000);
    }

    /** Runs payroll for every salaried staff member for the given month. One run per tenant per month. */
    public function run(Tenant $tenant, Carbon $periodMonth, ?string $runByUserId): PayrollRun
    {
        $run = PayrollRun::create([
            'period_month' => $periodMonth->startOfMonth(),
            'run_by'       => $runByUserId,
        ]);

        User::whereNotNull('monthly_salary_cents')->each(function (User $user) use ($run, $tenant) {
            $gross = $user->monthly_salary_cents;
            $paye = $this->computePaye($gross);
            $aidsLevy = $this->computeAidsLevy($paye);
            $nssa = $this->computeNssa($gross, $tenant);

            Payslip::create([
                'payroll_run_id'  => $run->id,
                'user_id'         => $user->id,
                'gross_cents'     => $gross,
                'paye_cents'      => $paye,
                'aids_levy_cents' => $aidsLevy,
                'nssa_cents'      => $nssa,
                'net_cents'       => $gross - $paye - $aidsLevy - $nssa,
            ]);
        });

        return $run;
    }
}
