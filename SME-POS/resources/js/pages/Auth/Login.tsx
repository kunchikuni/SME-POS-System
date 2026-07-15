import { Head, useForm, usePage } from "@inertiajs/react";
import type { FormEvent } from "react";
import type { SharedProps } from "../../lib/types";

interface LoginProps extends SharedProps {
  welcome: boolean;
}

export default function Login() {
  const { tenant, welcome } = usePage<LoginProps>().props;

  const form = useForm({ email: "", password: "", remember: false });

  function submit(e: FormEvent) {
    e.preventDefault();
    form.post("/login", { onFinish: () => form.reset("password") });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <Head title="Sign in" />

      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {tenant?.name ?? "Wivae"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {welcome ? "Your store is ready — sign in to get started." : "Sign in to your dashboard."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            autoFocus
            value={form.data.email}
            onChange={(e) => form.setData("email", e.target.value)}
            className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            aria-invalid={Boolean(form.errors.email)}
          />
          {form.errors.email && (
            <span className="mt-1 block text-xs text-red-600">{form.errors.email}</span>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            value={form.data.password}
            onChange={(e) => form.setData("password", e.target.value)}
            className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={form.data.remember}
            onChange={(e) => form.setData("remember", e.target.checked)}
          />
          Keep me signed in
        </label>

        <button
          type="submit"
          disabled={form.processing}
          className="w-full rounded-lg bg-brand-500 px-4 py-2.5 font-medium text-white transition hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
        >
          {form.processing ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
