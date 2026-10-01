import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";
import UpgradeRequired from "../../Components/UpgradeRequired.js";

interface StaffRow {
  id: string;
  name: string;
  role: string;
  monthlySalaryCents: number | null;
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
  periodMonth: string;
  totalNet: number;
  staffCount: number;
  payslips: PayslipRow[];
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Salary-based payroll. PAYE + 3% AIDS levy use ZIMRA-confirmed monthly USD
 * brackets; NSSA is a rate/ceiling you configure yourself below.
 */
export default function PayrollIndex() {
  usePageTitle("Payroll");
  const { flash, showFlash } = useFlash();
  const { data, loading, errorInfo, refetch } = useQuery(() => api.payroll.list(), []);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [nssaForm, setNssaForm] = useState<{ nssaRateBps: number; nssaCeilingCents: number } | null>(null);

  const staff: StaffRow[] = (data?.staff ?? []) as StaffRow[];
  const runs: RunRow[] = (data?.runs ?? []) as RunRow[];
  const nssaRateBps: number = (data?.nssaRateBps as number) ?? 0;
  const nssaCeilingCents: number = (data?.nssaCeilingCents as number) ?? 0;

  // Initialise local nssa form from server data
  const nssa = nssaForm ?? { nssaRateBps, nssaCeilingCents };
  const nssaRatePercent = nssa.nssaRateBps / 100;
  const nssaCeiling = nssa.nssaCeilingCents / 100;

  const onPayroll = staff.filter((s) => s.monthlySalaryCents !== null);

  const { submit: saveNssa, loading: savingNssa } = useMutation(
    (d: { nssaRateBps: number; nssaCeilingCents: number }) => api.payroll.saveNssa(d),
    { onSuccess: () => { showFlash("NSSA settings saved."); refetch(); } }
  );

  const { submit: runPayroll, loading: runningPayroll } = useMutation(
    (periodMonth: string) => api.payroll.run(periodMonth),
    {
      onSuccess: (r) => {
        showFlash(r?.message ?? "Payroll run complete.");
        refetch();
      },
    }
  );

  function handleRunPayroll() {
    if (!confirm(`Run payroll for ${onPayroll.length} staff member(s) this month?`)) return;
    const periodMonth = new Date().toISOString().slice(0, 7) + "-01";
    runPayroll(periodMonth);
  }

  // Determine if payroll already run this month
  const thisMonth = new Date().toISOString().slice(0, 7);
  const alreadyRan = runs.some((r) => r.periodMonth?.startsWith(thisMonth));

  if (loading) {
    return (
      <AppLayout>
        <div className="mt-8 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  // Plan gate: show the upgrade card instead of an empty payroll page.
  if (errorInfo?.code === "plan_upgrade_required") {
    return (
      <AppLayout>
        <UpgradeRequired feature={errorInfo.feature ?? "payroll"} plan={errorInfo.plan} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {flash.message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${flash.type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>
          {flash.message}
        </div>
      )}

      <h1 className="text-xl font-semibold tracking-tight text-ink">HR &amp; Payroll</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Salary-based payroll. PAYE uses ZIMRA's confirmed brackets, plus the 3% AIDS levy on tax due.
        There's no hourly/shift tracking yet — this pays a fixed monthly salary per staff member.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="font-semibold text-ink">Staff salaries</h2>
          <ul className="mt-3 divide-y divide-hairline">
            {staff.map((s) => (
              <SalaryRow key={s.id} staff={s} onSaved={() => refetch()} />
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <form
            onSubmit={(e) => { e.preventDefault(); saveNssa(nssa); }}
            className="rounded-xl border border-hairline bg-surface p-5"
          >
            <h2 className="font-semibold text-ink">NSSA settings</h2>
            <p className="mt-1 text-xs text-muted">
              Not set by default — enter your current NSSA employee rate and insurable earnings
              ceiling to have it deducted on payslips.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nssaRatePercent}
                  onChange={(e) => setNssaForm(f => ({ ...(f ?? nssa), nssaRateBps: Math.round(Number(e.target.value) * 100) }))}
                  className="w-full rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Ceiling ($/mo)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nssaCeiling}
                  onChange={(e) => setNssaForm(f => ({ ...(f ?? nssa), nssaCeilingCents: Math.round(Number(e.target.value) * 100) }))}
                  className="w-full rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingNssa}
              className="mt-3 w-full rounded-lg border border-hairline py-2 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
            >
              {savingNssa ? "Saving…" : "Save NSSA settings"}
            </button>
          </form>

          <div className="rounded-xl border border-hairline bg-surface p-5">
            <h2 className="font-semibold text-ink">Run payroll</h2>
            <p className="mt-1 text-sm text-muted">
              {onPayroll.length} staff member{onPayroll.length === 1 ? "" : "s"} on payroll this month.
            </p>
            <button
              onClick={handleRunPayroll}
              disabled={runningPayroll || alreadyRan || onPayroll.length === 0}
              className="mt-3 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {alreadyRan ? "Already run this month" : "Run this month's payroll"}
            </button>
          </div>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="border-b border-hairline px-5 py-3">
          <h2 className="font-semibold text-ink">Payroll history</h2>
        </div>
        {runs.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">No payroll runs yet.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setExpandedRun(expandedRun === r.id ? null : r.id)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-canvas"
                >
                  <span className="font-medium text-ink">
                    {new Date(r.periodMonth).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </span>
                  <span className="text-sm text-muted">
                    {r.staffCount} payslip{r.staffCount === 1 ? "" : "s"} · {money(r.totalNet)} net
                  </span>
                </button>
                {expandedRun === r.id && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-canvas text-left text-xs text-muted">
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
                          <tr key={i} className="border-t border-hairline">
                            <td className="px-5 py-2">{p.user}</td>
                            <td className="px-5 py-2 text-right tabular-nums">{money(p.gross)}</td>
                            <td className="px-5 py-2 text-right tabular-nums text-red-600">-{money(p.paye)}</td>
                            <td className="px-5 py-2 text-right tabular-nums text-red-600">-{money(p.aids_levy)}</td>
                            <td className="px-5 py-2 text-right tabular-nums text-red-600">-{money(p.nssa)}</td>
                            <td className="px-5 py-2 text-right font-medium tabular-nums text-ink">{money(p.net)}</td>
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

function SalaryRow({ staff, onSaved }: { staff: StaffRow; onSaved: () => void }) {
  const [salary, setSalary] = useState(
    staff.monthlySalaryCents !== null ? (staff.monthlySalaryCents / 100).toFixed(2) : ""
  );

  const { submit, loading } = useMutation(
    (v: string) =>
      api.payroll.setSalary(staff.id, v === "" ? null : Math.round(parseFloat(v) * 100)),
    { onSuccess: onSaved }
  );

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-ink">{staff.name}</div>
        <div className="text-xs capitalize text-muted">{staff.role}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">$</span>
        <input
          type="number"
          step="0.01"
          placeholder="Not on payroll"
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
          onBlur={() => submit(salary)}
          disabled={loading}
          className="w-28 rounded-lg border border-hairline px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
        />
        <span className="text-xs text-muted">/mo</span>
      </div>
    </li>
  );
}
