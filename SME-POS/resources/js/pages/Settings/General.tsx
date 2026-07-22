import { Head, router, useForm } from "@inertiajs/react";
import { useState } from "react";
import type { FormEvent } from "react";
import AppLayout from "../../Layouts/AppLayout";
import { SettingsTabs } from "./SettingsTabs";

interface Props {
  name: string;
  currency: string;
  taxRatePercent: number;
  currencies: string[];
  mode: "retail" | "restaurant";
  [key: string]: unknown;
}

const CURRENCY_LABELS: Record<string, string> = {
  USD: "USD - US Dollar",
  ZWL: "ZWL - Zimbabwe Dollar",
  ZAR: "ZAR - South African Rand",
};

/**
 * Business name, display currency, and the VAT rate. The tax rate here is not
 * cosmetic — it's exactly what pos/src/lib/tax.ts backs out of every shelf
 * price on the till, on next sync (docs/ARCHITECTURE.md §3).
 */
export default function GeneralSettings({ name, currency, taxRatePercent, currencies, mode }: Props) {
  const form = useForm({ name, currency, taxRatePercent });

  function submit(e: FormEvent) {
    e.preventDefault();
    form.patch("/settings/general", { preserveScroll: true });
  }

  return (
    <AppLayout>
      <Head title="Settings" />
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your store configuration</p>
      <SettingsTabs active="general" />

      <form onSubmit={submit} className="mt-6 max-w-lg space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">General Settings</h2>

        <Field label="Business name" error={form.errors.name}>
          <input
            value={form.data.name}
            onChange={(e) => form.setData("name", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <Field label="Currency" error={form.errors.currency}>
          <select
            value={form.data.currency}
            onChange={(e) => form.setData("currency", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tax Rate (%)" error={form.errors.taxRatePercent}>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={form.data.taxRatePercent}
            onChange={(e) => form.setData("taxRatePercent", Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <p className="mt-1 text-xs text-slate-400">
            Applied to standard-rated products only, inclusive of the shelf price — the
            price on the till doesn't change, this only affects the VAT breakdown shown on
            receipts. 0% means no VAT is charged.
          </p>
        </Field>

        <button
          type="submit"
          disabled={form.processing}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {form.processing ? "Saving…" : "Save Changes"}
        </button>
        {form.recentlySuccessful && <span className="ml-3 text-sm text-green-600">Saved.</span>}
      </form>

      <StoreModeCard mode={mode} />
    </AppLayout>
  );
}

function StoreModeCard({ mode }: { mode: "retail" | "restaurant" }) {
  const [confirming, setConfirming] = useState<"retail" | "restaurant" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(next: "retail" | "restaurant") {
    setBusy(true);
    setError(null);
    router.patch(
      "/settings/mode",
      { mode: next },
      {
        preserveScroll: true,
        onSuccess: () => setConfirming(null),
        onError: () => setError("Couldn't switch modes — you may not have permission, or the request failed. Try again."),
        onFinish: () => setBusy(false),
      },
    );
  }

  return (
    <div className="mt-6 max-w-lg rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">Store mode</h2>
      <p className="mt-1 text-sm text-slate-500">
        A tenant-wide setting, not a fork — this decides the till layout every cashier sees.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {(["retail", "restaurant"] as const).map((m) => (
          <button
            key={m}
            onClick={() => (m === mode ? null : setConfirming(m))}
            className={`rounded-lg border p-3 text-left ${
              mode === m ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <div className="font-medium capitalize text-slate-900">{m}</div>
            <div className="text-xs text-slate-500">
              {m === "retail" ? "Product grid, no tables" : "Floor plan, tables, kitchen, gratuity"}
            </div>
            {mode === m && <div className="mt-1 text-xs font-medium text-blue-600">Current</div>}
          </button>
        ))}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 sm:p-6" onClick={() => setConfirming(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">
              Switch to {confirming}?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirming === "restaurant" ? (
                <>Every till opens on a <strong>floor plan</strong> instead of the product grid. Cashiers pick a table before ordering, gratuity is offered at checkout, and the <strong>Kitchen</strong> display becomes reachable in the sidebar.</>
              ) : (
                <>Every till goes back to the plain product-grid checkout. Tables, gratuity, and the <strong>Kitchen</strong> display stop being used — existing table/kitchen data isn't deleted, just no longer active.</>
              )}
            </p>
            <p className="mt-2 text-xs text-slate-400">Takes effect immediately for every cashier, on their next sync.</p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirming(null)}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => apply(confirming)}
                disabled={busy}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Switching…" : `Switch to ${confirming}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
