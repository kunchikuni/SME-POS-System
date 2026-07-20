<?php

namespace App\Http\Controllers;

use App\Domain\Payroll\PayrollService;
use App\Domain\Tenancy\TenantContext;
use App\Models\PayrollRun;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

/**
 * HR & Payroll (MVP: salary-based, not hourly — see PayrollService docblock).
 * PAYE/AIDS levy use ZIMRA-confirmed brackets; NSSA is tenant-configured, not
 * hardcoded (see PayrollService for why).
 */
class PayrollController extends Controller
{
    public function index(TenantContext $tenant): Response
    {
        $staff = User::orderBy('name')->get(['id', 'name', 'role', 'monthly_salary_cents']);

        $runs = PayrollRun::with('payslips.user:id,name')
            ->orderByDesc('period_month')
            ->get()
            ->map(fn (PayrollRun $r) => [
                'id'           => $r->id,
                'period_month' => $r->period_month->toDateString(),
                'total_net'    => $r->payslips->sum('net_cents'),
                'staff_count'  => $r->payslips->count(),
                'payslips'     => $r->payslips->map(fn ($p) => [
                    'user'       => $p->user->name,
                    'gross'      => $p->gross_cents,
                    'paye'       => $p->paye_cents,
                    'aids_levy'  => $p->aids_levy_cents,
                    'nssa'       => $p->nssa_cents,
                    'net'        => $p->net_cents,
                ]),
            ]);

        return Inertia::render('Payroll/Index', [
            'staff'         => $staff,
            'runs'          => $runs,
            'nssaRatePercent' => ($tenant->get()->nssa_rate_bps ?? 0) / 100,
            'nssaCeiling'   => ($tenant->get()->nssa_ceiling_cents ?? 0) / 100,
            'alreadyRanThisMonth' => PayrollRun::where('period_month', now()->startOfMonth())->exists(),
        ]);
    }

    public function setSalary(Request $request, string $user): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate(['monthly_salary' => ['nullable', 'numeric', 'min:0']]);
        $staff = User::findOrFail($user);
        $staff->monthly_salary_cents = $data['monthly_salary'] !== null
            ? (int) round($data['monthly_salary'] * 100)
            : null;
        $staff->save();

        return back()->with('flash', "Salary updated for {$staff->name}.");
    }

    public function setNssa(Request $request, TenantContext $tenant): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate([
            'nssa_rate_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'nssa_ceiling'      => ['required', 'numeric', 'min:0'],
        ]);

        $tenant->get()->update([
            'nssa_rate_bps'      => (int) round($data['nssa_rate_percent'] * 100),
            'nssa_ceiling_cents' => (int) round($data['nssa_ceiling'] * 100),
        ]);

        return back()->with('flash', 'NSSA settings updated.');
    }

    public function run(Request $request, PayrollService $payroll, TenantContext $tenant): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        if (PayrollRun::where('period_month', now()->startOfMonth())->exists()) {
            return back()->with('flash', 'Payroll for this month has already been run.');
        }

        $payroll->run($tenant->get(), Carbon::now(), $request->user()->id);

        return back()->with('flash', 'Payroll run complete.');
    }
}
