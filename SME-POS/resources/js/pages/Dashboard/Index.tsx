import { Head, Link } from "@inertiajs/react";
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
          Import a catalogue or add items one by one.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            href="/products/create"
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Add product
          </Link>
          <Link
            href="/products/import"
            className="rounded-lg border border-hairline px-3 py-2 text-sm font-medium hover:bg-canvas"
          >
            Import CSV
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
