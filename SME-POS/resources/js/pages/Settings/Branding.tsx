import { useState, useEffect } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";
import { SettingsTabs } from "./SettingsTabs.js";
import { useAuth } from "../../lib/auth.js";

export default function BrandingSettings() {
  usePageTitle("Branding");
  const { tenant } = useAuth();
  const { data, loading } = useQuery(() => api.settings.getBranding(), []);
  const [form, setForm] = useState({
    name: "",
    primary: "#1d4ed8",
    accent: "#7c3aed",
    logoUrl: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const b = (data?.branding as any) ?? {};
    if (b) {
      setForm({
        name: b.name ?? "",
        primary: b.primary ?? "#1d4ed8",
        accent: b.accent ?? "#7c3aed",
        logoUrl: b.logo_url ?? "",
      });
    }
  }, [data]);

  const { submit, loading: saving, errors } = useMutation(
    (d: typeof form) => api.settings.saveBranding({
      name: d.name,
      primary: d.primary,
      accent: d.accent,
      logo_url: d.logoUrl || null,
    }),
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
      <SettingsTabs active="branding" />

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); submit(form); }} className="space-y-5">
          <Field label="Business name" error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            />
          </Field>

          <Field label="Subdomain">
            <div className="flex items-center rounded-lg border border-hairline bg-canvas px-3 py-2 text-muted">
              <span className="font-medium text-ink">{tenant?.subdomain}</span>
              <span>.{window.location.hostname.replace(`${tenant?.subdomain}.`, "")}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Set at signup — contact support to change it.</p>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Primary colour" error={errors.primary}>
              <ColorInput value={form.primary} onChange={(v) => setForm(f => ({ ...f, primary: v }))} />
            </Field>
            <Field label="Accent colour" error={errors.accent}>
              <ColorInput value={form.accent} onChange={(v) => setForm(f => ({ ...f, accent: v }))} />
            </Field>
          </div>

          <Field label="Logo URL" error={errors.logo_url}>
            <input
              value={form.logoUrl}
              onChange={(e) => setForm(f => ({ ...f, logoUrl: e.target.value }))}
              placeholder="https://…/logo.png"
              className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            />
          </Field>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-5 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save branding"}
          </button>
          {saved && <span className="ml-3 text-sm text-green-600">Saved.</span>}
        </form>

        {/* Live preview */}
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Preview</p>
          <div className="overflow-hidden rounded-xl border border-hairline">
            <div
              className="flex items-center gap-3 px-4 py-3 text-white"
              style={{ backgroundColor: form.primary }}
            >
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="" className="h-6 w-auto" />
              ) : (
                <span className="font-semibold">{form.name || "Your business"}</span>
              )}
            </div>
            <div className="space-y-3 bg-surface p-4">
              <div className="h-2 w-2/3 rounded bg-canvas" />
              <div className="h-2 w-1/2 rounded bg-canvas" />
              <button
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: form.accent }}
                type="button"
              >
                Sample action
              </button>
            </div>
          </div>
        </div>
      </div>
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

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 cursor-pointer rounded border border-hairline"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-hairline px-3 py-2 font-mono text-sm uppercase outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
      />
    </div>
  );
}
