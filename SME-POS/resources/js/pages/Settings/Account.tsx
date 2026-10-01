import { useEffect, useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useMutation, useQuery } from "../../lib/hooks.js";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { SettingsTabs } from "./SettingsTabs.js";

/** My own account — mobile number for payment reminders, and password. Reachable from the avatar menu. */
export default function AccountSettings() {
  usePageTitle("Account");
  const { user, refetch: refetchAuth } = useAuth();

  // The mobile number payment reminders are texted to. Blank removes it.
  const { data: account } = useQuery(() => api.settings.getAccount(), []);
  const [phone, setPhone] = useState("");
  const [phoneSaved, setPhoneSaved] = useState<string | null>(null);
  useEffect(() => { if (account) setPhone(account.phone ?? ""); }, [account]);
  const { submit: savePhone, loading: savingPhone, errors: phoneErrors, error: phoneError } = useMutation(
    (p: string) => api.settings.savePhone(p.trim() || null),
    {
      onSuccess: (r) => {
        setPhone(r.phone ?? "");
        setPhoneSaved(r.message);
        setTimeout(() => setPhoneSaved(null), 3000);
        void refetchAuth(); // so the rest of the dashboard knows whether a number is on file
      },
    },
  );
  const [form, setForm] = useState({
    currentPassword: "",
    password: "",
    passwordConfirmation: "",
  });
  const [saved, setSaved] = useState(false);

  const { submit, loading, errors, error } = useMutation(
    (d: typeof form) => api.settings.changePassword({
      current_password: d.currentPassword,
      password: d.password,
      password_confirmation: d.passwordConfirmation,
    }),
    {
      onSuccess: () => {
        setForm({ currentPassword: "", password: "", passwordConfirmation: "" });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      },
    }
  );

  return (
    <AppLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">Manage your store configuration</p>
      <SettingsTabs active="account" />

      <div className="mt-6 max-w-lg rounded-xl border border-hairline bg-surface p-6">
        <h2 className="font-semibold text-ink">{user?.name}</h2>
        <p className="text-sm text-muted">{user?.email}</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); savePhone(phone); }}
        className="mt-6 max-w-lg space-y-3 rounded-xl border border-hairline bg-surface p-6"
      >
        <h2 className="font-semibold text-ink">Mobile number</h2>
        <p className="text-sm text-muted">
          We text this number before a payment is due or your tills pause — so a missed email doesn't cost you.
          It's used for nothing else, and you can remove it any time.
        </p>
        {phoneError && !phoneErrors.phone && <p className="text-sm text-red-600">{phoneError}</p>}
        <Field label="Mobile number" error={phoneErrors.phone}>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            placeholder="0771234567"
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
          />
        </Field>
        <button
          type="submit"
          disabled={savingPhone || (!phone.trim() && !account?.phone)}
          className="rounded-lg bg-brand-500 px-5 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {savingPhone ? "Saving…" : phone.trim() ? "Save number" : "Remove number"}
        </button>
        {phoneSaved && <span className="ml-3 text-sm text-green-600">{phoneSaved}</span>}
      </form>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(form); }}
        className="mt-6 max-w-lg space-y-5 rounded-xl border border-hairline bg-surface p-6"
      >
        <h2 className="font-semibold text-ink">Change password</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <Field label="Current password" error={errors.current_password}>
          <input
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm(f => ({ ...f, currentPassword: e.target.value }))}
            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
          />
        </Field>

        <Field label="New password" error={errors.password}>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
          />
        </Field>

        <Field label="Confirm new password">
          <input
            type="password"
            value={form.passwordConfirmation}
            onChange={(e) => setForm(f => ({ ...f, passwordConfirmation: e.target.value }))}
            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-500 px-5 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Update password"}
        </button>
        {saved && <span className="ml-3 text-sm text-green-600">Updated.</span>}
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
