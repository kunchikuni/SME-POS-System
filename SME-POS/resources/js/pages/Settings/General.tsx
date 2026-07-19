import { Head, useForm } from "@inertiajs/react";
import type { FormEvent } from "react";
import AppLayout from "../../Layouts/AppLayout";
import { SettingsTabs } from "./SettingsTabs";

interface Props {
  name: string;
  currency: string;
  taxRatePercent: number;
  currencies: string[];
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
export default function GeneralSettings({ name, currency, taxRatePercent, currencies }: Props) {
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
    </AppLayout>
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
