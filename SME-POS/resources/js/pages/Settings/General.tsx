import { useState, useEffect } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";
import { SettingsTabs } from "./SettingsTabs.js";

const CURRENCY_LABELS: Record<string, string> = {
  USD: "USD - US Dollar",
  ZWL: "ZWL - Zimbabwe Dollar",
  ZAR: "ZAR - South African Rand",
};
const CURRENCIES = ["USD", "ZWL", "ZAR"];

/**
 * Business name, display currency, and the VAT rate. The tax rate here is not
 * cosmetic — it's exactly what pos/src/lib/tax.ts backs out of every shelf
 * price on the till, on next sync.
 */
export default function GeneralSettings() {
  usePageTitle("Settings");
  const { data, loading } = useQuery(() => api.settings.getGeneral(), []);
  const [form, setForm] = useState({ name: "", currency: "USD", taxRateBps: 0 });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        name: (data as any).name ?? "",
        currency: data.currency ?? "USD",
        taxRateBps: data.taxRateBps ?? 0,
      });
    }
  }, [data]);

  const { submit, loading: saving, errors } = useMutation(
    (d: typeof form) => api.settings.saveGeneral(d),
    {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      },
    }
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="mt-8 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">Manage your store configuration</p>
      <SettingsTabs active="general" />

      <form
        onSubmit={(e) => { e.preventDefault(); submit(form); }}
        className="mt-6 max-w-lg space-y-5 rounded-xl border border-hairline bg-surface p-6"
      >
        <h2 className="font-semibold text-ink">General Settings</h2>

        <Field label="Business name" error={errors.name}>
          <input
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
          />
        </Field>

        <Field label="Currency" error={errors.currency}>
          <select
            value={form.currency}
            onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}
            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{CURRENCY_LABELS[c] ?? c}</option>
            ))}
          </select>
        </Field>

        <Field label="Tax Rate (%)" error={errors.taxRateBps}>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={(form.taxRateBps / 100).toFixed(2)}
            onChange={(e) => setForm(f => ({ ...f, taxRateBps: Math.round(Number(e.target.value) * 100) }))}
            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
          />
          <p className="mt-1 text-xs text-muted">
            Applied to standard-rated products only, inclusive of the shelf price.
            0% means no VAT is charged.
          </p>
        </Field>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-500 px-5 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {saved && <span className="ml-3 text-sm text-green-600">Saved.</span>}
      </form>
    </AppLayout>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
