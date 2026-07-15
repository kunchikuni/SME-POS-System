import { Head, useForm, usePage } from "@inertiajs/react";
import type { FormEvent } from "react";
import type { SharedProps } from "../../lib/types";

interface RegisterProps extends SharedProps {
  trialDays: number;
  tenantDomain: string;
}

export default function Register() {
  const { trialDays, tenantDomain } = usePage<RegisterProps>().props;

  const form = useForm({
    business_name: "",
    subdomain: "",
    owner_name: "",
    owner_email: "",
    password: "",
    password_confirmation: "",
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    form.post("/register");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Head title="Start your free trial" />

      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Start selling in minutes
      </h1>
      <p className="mt-2 text-sm text-muted">
        {trialDays} days free. No card required.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field
          label="Business name"
          value={form.data.business_name}
          onChange={(v) => form.setData("business_name", v)}
          error={form.errors.business_name}
          autoFocus
        />

        <div>
          <Field
            label="Your Wivae address"
            value={form.data.subdomain}
            onChange={(v) =>
              form.setData("subdomain", v.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            error={form.errors.subdomain}
          />
          {form.data.subdomain && !form.errors.subdomain && (
            <p className="mt-1 text-xs text-muted">
              {form.data.subdomain}.{tenantDomain}
            </p>
          )}
        </div>

        <Field
          label="Your name"
          value={form.data.owner_name}
          onChange={(v) => form.setData("owner_name", v)}
          error={form.errors.owner_name}
        />
        <Field
          label="Email"
          type="email"
          value={form.data.owner_email}
          onChange={(v) => form.setData("owner_email", v)}
          error={form.errors.owner_email}
        />
        <Field
          label="Password"
          type="password"
          value={form.data.password}
          onChange={(v) => form.setData("password", v)}
          error={form.errors.password}
        />
        <Field
          label="Confirm password"
          type="password"
          value={form.data.password_confirmation}
          onChange={(v) => form.setData("password_confirmation", v)}
        />

        <button
          type="submit"
          disabled={form.processing}
          className="w-full rounded-lg bg-brand-500 px-4 py-2.5 font-medium text-white transition hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
        >
          {form.processing ? "Creating your store…" : "Start free trial"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        aria-invalid={Boolean(error)}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
