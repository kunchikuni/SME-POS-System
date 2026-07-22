import { Head, Link, useForm, usePage } from "@inertiajs/react";
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
    <div className="grid min-h-screen place-items-center bg-canvas p-4 sm:p-6 relative overflow-hidden">
      <Head title="Start your free trial" />

      {/* Radial glow matching device pairing page */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,transparent_65%)]" />

      <div className="relative z-10 w-full max-w-md anim-pop-in my-8">
        {/* Logo lockup */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-2xl shadow-[0_0_30px_rgba(124,58,237,0.4)] ring-1 ring-white/10">
            🛒
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Start selling in minutes
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {trialDays} days free trial · No card required
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-hairline bg-surface/90 p-6 sm:p-8 shadow-xl backdrop-blur-md">
          <form onSubmit={submit} className="space-y-4">
            <Field
              label="Business name"
              value={form.data.business_name}
              onChange={(v) => form.setData("business_name", v)}
              error={form.errors.business_name}
              placeholder="Acme Retail & Cafe"
              autoFocus
            />

            <div>
              <Field
                label="Your Wivae subdomain"
                value={form.data.subdomain}
                onChange={(v) =>
                  form.setData("subdomain", v.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                error={form.errors.subdomain}
                placeholder="acme-store"
              />
              {form.data.subdomain && !form.errors.subdomain && (
                <p className="mt-1 text-xs text-muted">
                  http://<span className="font-semibold text-violet-500">{form.data.subdomain}</span>.{tenantDomain}
                </p>
              )}
            </div>

            <Field
              label="Your full name"
              value={form.data.owner_name}
              onChange={(v) => form.setData("owner_name", v)}
              error={form.errors.owner_name}
              placeholder="Jane Doe"
            />
            <Field
              label="Work email"
              type="email"
              value={form.data.owner_email}
              onChange={(v) => form.setData("owner_email", v)}
              error={form.errors.owner_email}
              placeholder="jane@acmeretail.com"
            />
            <Field
              label="Password"
              type="password"
              value={form.data.password}
              onChange={(v) => form.setData("password", v)}
              error={form.errors.password}
              placeholder="••••••••"
            />
            <Field
              label="Confirm password"
              type="password"
              value={form.data.password_confirmation}
              onChange={(v) => form.setData("password_confirmation", v)}
              placeholder="••••••••"
            />

            <button
              type="submit"
              disabled={form.processing}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 font-bold text-white text-sm tracking-wide shadow-lg shadow-indigo-500/25 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {form.processing ? "Creating your store…" : "Start Free Trial"}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-xs text-muted">
          Already have a store?{" "}
          <Link href="/login" className="font-semibold text-violet-500 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder = "",
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-hairline bg-canvas/60 px-4 py-3 text-sm text-ink outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
        aria-invalid={Boolean(error)}
      />
      {error && (
        <p className="mt-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-red-500/20">
          {error}
        </p>
      )}
    </div>
  );
}
