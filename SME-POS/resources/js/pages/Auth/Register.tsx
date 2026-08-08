import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/hooks.js";

const TRIAL_DAYS = 14;
const TENANT_DOMAIN = import.meta.env.VITE_TENANT_DOMAIN ?? "wivae.test";

export default function Register() {
  usePageTitle("Start your free trial");
  const navigate = useNavigate();

  const [form, setForm] = useState({
    business_name: "", subdomain: "", owner_name: "",
    owner_email: "", password: "", password_confirmation: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      await fetch("/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(form),
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new ApiError(r.status, body.message ?? "Error", body);
        return body;
      });
      // Redirect to the tenant subdomain login page
      window.location.href = `http://${form.subdomain}.${TENANT_DOMAIN}/login?welcome=1`;
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as Record<string, unknown>;
        setErrors((body.errors as Record<string, string>) ?? { general: err.message });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-4 sm:p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,transparent_65%)]" />

      <div className="relative z-10 w-full max-w-md anim-pop-in my-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-2xl shadow-[0_0_30px_rgba(124,58,237,0.4)] ring-1 ring-white/10">🛒</div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Start selling in minutes</h1>
          <p className="mt-1.5 text-sm text-muted">{TRIAL_DAYS} days free trial · No card required</p>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface/90 p-6 sm:p-8 shadow-xl backdrop-blur-md">
          <form onSubmit={submit} className="space-y-4">
            {errors.general && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-red-500/20">{errors.general}</p>
            )}
            <Field label="Business name" value={form.business_name} onChange={set("business_name")} error={errors.business_name} placeholder="Acme Retail & Cafe" autoFocus />
            <div>
              <Field
                label="Your Wivae subdomain"
                value={form.subdomain}
                onChange={(v) => set("subdomain")(v.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                error={errors.subdomain}
                placeholder="acme-store"
              />
              {form.subdomain && !errors.subdomain && (
                <p className="mt-1 text-xs text-muted">
                  http://<span className="font-semibold text-violet-500">{form.subdomain}</span>.{TENANT_DOMAIN}
                </p>
              )}
            </div>
            <Field label="Your full name" value={form.owner_name} onChange={set("owner_name")} error={errors.owner_name} placeholder="Jane Doe" />
            <Field label="Work email" type="email" value={form.owner_email} onChange={set("owner_email")} error={errors.owner_email} placeholder="jane@acmeretail.com" />
            <Field label="Password" type="password" value={form.password} onChange={set("password")} error={errors.password} placeholder="••••••••" />
            <Field label="Confirm password" type="password" value={form.password_confirmation} onChange={set("password_confirmation")} placeholder="••••••••" />

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 font-bold text-white text-sm tracking-wide shadow-lg shadow-indigo-500/25 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loading ? "Creating your store…" : "Start Free Trial"}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-xs text-muted">
          Already have a store?{" "}
          <Link to="/login" className="font-semibold text-violet-500 hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, error, type = "text", placeholder = "", autoFocus = false }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; type?: string; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">{label}</label>
      <input type={type} value={value} autoFocus={autoFocus} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-hairline bg-canvas/60 px-4 py-3 text-sm text-ink outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
        aria-invalid={Boolean(error)}
      />
      {error && <p className="mt-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-red-500/20">{error}</p>}
    </div>
  );
}
