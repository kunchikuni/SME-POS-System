import { Head, useForm } from "@inertiajs/react";
import type { FormEvent } from "react";
import AppLayout from "../../Layouts/AppLayout";
import { SettingsTabs } from "./SettingsTabs";

interface Props {
  name: string;
  email: string;
  [key: string]: unknown;
}

/** Change my own password — reachable from the avatar menu. */
export default function AccountSettings({ name, email }: Props) {
  const form = useForm({
    current_password: "",
    password: "",
    password_confirmation: "",
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    form.patch("/settings/account/password", {
      preserveScroll: true,
      onSuccess: () => form.reset(),
    });
  }

  return (
    <AppLayout>
      <Head title="Account" />
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your store configuration</p>
      <SettingsTabs active="account" />

      <div className="mt-6 max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">{name}</h2>
        <p className="text-sm text-slate-500">{email}</p>
      </div>

      <form onSubmit={submit} className="mt-6 max-w-lg space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Change password</h2>

        <Field label="Current password" error={form.errors.current_password}>
          <input
            type="password"
            value={form.data.current_password}
            onChange={(e) => form.setData("current_password", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <Field label="New password" error={form.errors.password}>
          <input
            type="password"
            value={form.data.password}
            onChange={(e) => form.setData("password", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <Field label="Confirm new password">
          <input
            type="password"
            value={form.data.password_confirmation}
            onChange={(e) => form.setData("password_confirmation", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <button
          type="submit"
          disabled={form.processing}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {form.processing ? "Saving…" : "Update password"}
        </button>
        {form.recentlySuccessful && <span className="ml-3 text-sm text-green-600">Updated.</span>}
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
