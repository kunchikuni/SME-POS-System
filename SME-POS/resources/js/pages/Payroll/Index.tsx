import { Head, useForm, usePage } from "@inertiajs/react";
import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface StaffRow {
  id: string;
  name: string;
  role: string;
  monthly_salary_cents: number | null;
}
interface PayslipRow {
  user: string;
  gross: number;
  paye: number;
  aids_levy: number;
  nssa: number;
  net: number;
}
interface RunRow {
  id: string;
  period_month: string;
  total_net: number;
  staff_count: number;
  payslips: PayslipRow[];
}
interface Props {
  staff: StaffRow[];
  runs: RunRow[];
  nssaRatePercent: number;
  nssaCeiling: number;
  alreadyRanThisMonth: boolean;
  [key: string]: unknown;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Salary-based payroll. PAYE + 3% AIDS levy use ZIMRA-confirmed monthly USD
 * brackets; NSSA is a rate/ceiling you configure yourself below — sources
 * disagreed on the current NSSA employee rate, so it isn't guessed for you.
 */
export default function PayrollIndex() {
  const { staff, runs, nssaRatePercent, nssaCeiling, alreadyRanThisMonth } = usePage<Props>().props;
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const runForm = useForm({});
  const nssaForm = useForm({ nssa_rate_percent: nssaRatePercent, nssa_ceiling: nssaCeiling });

  const onPayroll = staff.filter((s) => s.monthly_salary_cents !== null);

  function saveNssa(e: React.FormEvent) {
    e.preventDefault();
    nssaForm.patch("/payroll/nssa", { preserveScroll: true });
  }

  function runPayroll() {
    if (!confirm(`Run payroll for ${onPayroll.length} staff member(s) this month?`)) return;
    runForm.post("/payroll/run", { preserveScroll: true });
  }

  return (
    <AppLayout>
      <Head title="Payroll" />
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">HR &amp; Payroll</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Salary-based payroll. PAYE uses ZIMRA's confirmed brackets, plus the 3% AIDS levy on tax due.
        There's no hourly/shift tracking yet — this pays a fixed monthly salary per staff member.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Staff salaries</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {staff.map((s) => (
              <SalaryRow key={s.id} staff={s} />
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <form onSubmit={saveNssa} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">NSSA settings</h2>
            <p className="mt-1 text-xs text-slate-400">
              Not set by default — enter your current NSSA employee rate and insurable earnings
              ceiling to have it deducted on payslips.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={nssaForm.data.nssa_rate_percent}
                  onChange={(e) => nssaForm.setData("nssa_rate_percent", Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Ceiling ($/mo)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nssaForm.data.nssa_ceiling}
                  onChange={(e) => nssaForm.setData("nssa_ceiling", Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={nssaForm.processing}
              className="mt-3 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Save NSSA settings
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Run payroll</h2>
            <p className="mt-1 text-sm text-slate-500">
              {onPayroll.length} staff member{onPayroll.length === 1 ? "" : "s"} on payroll this month.
            </p>
            <button
              onClick={runPayroll}
              disabled={runForm.processing || alreadyRanThisMonth || onPayroll.length === 0}
              className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {alreadyRanThisMonth ? "Already run this month" : "Run this month's payroll"}
            </button>
          </div>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-900">Payroll history</h2>
        </div>
        {runs.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No payroll runs yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setExpandedRun(expandedRun === r.id ? null : r.id)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">
                    {new Date(r.period_month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </span>
                  <span className="text-sm text-slate-500">
                    {r.staff_count} payslip{r.staff_count === 1 ? "" : "s"} · {money(r.total_net)} net
                  </span>
                </button>
                {expandedRun === r.id && (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-400">
                      <tr>
                        <th className="px-5 py-2 font-medium">Staff</th>
                        <th className="px-5 py-2 text-right font-medium">Gross</th>
                        <th className="px-5 py-2 text-right font-medium">PAYE</th>
                        <th className="px-5 py-2 text-right font-medium">AIDS levy</th>
                        <th className="px-5 py-2 text-right font-medium">NSSA</th>
                        <th className="px-5 py-2 text-right font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.payslips.map((p, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-5 py-2">{p.user}</td>
                          <td className="px-5 py-2 text-right tabular-nums">{money(p.gross)}</td>
                          <td className="px-5 py-2 text-right tabular-nums text-red-600">-{money(p.paye)}</td>
                          <td className="px-5 py-2 text-right tabular-nums text-red-600">-{money(p.aids_levy)}</td>
                          <td className="px-5 py-2 text-right tabular-nums text-red-600">-{money(p.nssa)}</td>
                          <td className="px-5 py-2 text-right font-medium tabular-nums text-slate-900">
                            {money(p.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppLayout>
  );
}

function SalaryRow({ staff }: { staff: StaffRow }) {
  const form = useForm({
    monthly_salary: staff.monthly_salary_cents !== null ? staff.monthly_salary_cents / 100 : "",
  });

  function save() {
    form.patch(`/payroll/staff/${staff.id}/salary`, { preserveScroll: true });
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-800">{staff.name}</div>
        <div className="text-xs capitalize text-slate-400">{staff.role}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">$</span>
        <input
          type="number"
          step="0.01"
          placeholder="Not on payroll"
          value={form.data.monthly_salary}
          onChange={(e) => form.setData("monthly_salary", e.target.value === "" ? "" : Number(e.target.value))}
          onBlur={save}
          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <span className="text-xs text-slate-400">/mo</span>
      </div>
    </li>
  );
}
