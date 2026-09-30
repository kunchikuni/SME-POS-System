import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import { usePageTitle } from "../../lib/hooks.js";
import { TENANT_DOMAIN, centralOrigin } from "../../lib/tenantDomain.js";

/** Only same-app paths — never "//evil.com" or an absolute URL (open redirect). */
function safeRedirect(target: string | null): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/login")) {
    return "/dashboard";
  }
  return target;
}

export default function Login() {
  usePageTitle("Sign in");
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});

  // On a workspace (spider.localhost), sign-up lives on the central site. Was
  // `//${domain}/register`, which dropped the port — a dead link in dev.
  const registerUrl =
    typeof window !== "undefined" && window.location.hostname.endsWith(`.${TENANT_DOMAIN}`)
      ? `${centralOrigin()}/register`
      : "/register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      await api.auth.login(email, password);
      await refetch();
      navigate(safeRedirect(searchParams.get("redirectTo")), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const body = err.body as Record<string, string>;
        if (body.email || body.password) {
          setErrors({ email: body.email, password: body.password });
        } else {
          setErrors({ general: body.message ?? "These credentials do not match our records." });
        }
      } else if (err instanceof ApiError && err.status === 429) {
        // Rate limited — the server's message says how long to wait.
        setErrors({ general: err.message });
      } else if (err instanceof ApiError && err.status === 401) {
        setErrors({ general: "These credentials do not match our records." });
      } else {
        setErrors({ general: "Something went wrong. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-4 sm:p-6 relative overflow-hidden">
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,transparent_65%)]" />

      <div className="relative z-10 w-full max-w-sm anim-pop-in">
        {/* Logo lockup */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-2xl shadow-[0_0_30px_rgba(124,58,237,0.4)] ring-1 ring-white/10">
            🛒
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Wivae POS</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in to your owner dashboard</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-hairline bg-surface/90 p-6 sm:p-8 shadow-xl backdrop-blur-md">
          <form onSubmit={submit} className="space-y-4">
            {errors.general && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-red-500/20">
                {errors.general}
              </p>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-hairline bg-canvas/60 px-4 py-3 text-sm text-ink outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                placeholder="name@business.com"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && (
                <p className="mt-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-red-500/20">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-hairline bg-canvas/60 px-4 py-3 text-sm text-ink outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-red-500/20">
                  {errors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 font-bold text-white text-sm tracking-wide shadow-lg shadow-indigo-500/25 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-xs text-muted">
          Don't have a store yet?{" "}
          <a href={registerUrl} className="font-semibold text-violet-500 hover:underline">
            Start a free trial
          </a>
        </div>
      </div>
    </div>
  );
}
