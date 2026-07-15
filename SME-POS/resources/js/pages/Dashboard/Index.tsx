import { Head } from "@inertiajs/react";
import AppLayout from "../../Layouts/AppLayout";

/**
 * Phase 1 dashboard. Intentionally near-empty: the exit criterion for
 * feat/foundation is "sign up, land here signed in." Real KPIs and the sales
 * chart arrive in feat/analytics (Phase 6); the empty states below name the
 * next action rather than showing a spinner.
 */
export default function DashboardIndex() {
  const kpis = [
    { label: "Today's sales", value: "$0.00" },
    { label: "Orders", value: "0" },
    { label: "Products", value: "0" },
    { label: "Branches", value: "1" },
  ];

  return (
    <AppLayout>
      <Head title="Dashboard" />

      <h1 className="font-display text-xl font-semibold tracking-tight">Dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-hairline bg-surface p-4"
          >
            <p className="text-sm text-muted">{k.label}</p>
            <p className="font-display font-tabular mt-1 text-2xl font-semibold">
              {k.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-hairline bg-surface p-8 text-center">
        <p className="font-medium">Add your first products to start selling</p>
        <p className="mt-1 text-sm text-muted">
          Import a catalogue or add items one by one. Coming in the next release.
        </p>
      </div>
    </AppLayout>
  );
}
