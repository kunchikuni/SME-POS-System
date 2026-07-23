import { useState } from "react";

/**
 * "Sign in" can't be a plain link on the root marketing domain — /login only
 * exists inside a tenant's own subdomain (ResolveTenant binds the tenant
 * BEFORE auth even runs; each tenant has entirely separate user accounts),
 * so a bare href="/login" from wivae.test 404s every time, by design, not
 * by bug. This is the actual fix: ask which store, then send them there.
 *
 * Checks existence via /tenant-lookup BEFORE navigating away, rather than
 * just building the URL and letting a wrong subdomain hit ResolveTenant's
 * raw framework 404 — a mistyped shop name is a common, expected mistake,
 * and a bare 404 page is a poor response to it. A real network failure on
 * the lookup itself still lets the visitor through to the tenant subdomain
 * rather than trapping them — that subdomain's own handling covers it
 * either way, so failing open here costs nothing extra.
 */
export function SignInPrompt({ tenantDomain, trigger }: { tenantDomain: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function go() {
    const clean = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!clean) return;

    setChecking(true);
    setNotFound(false);

    try {
      const res = await fetch(`/tenant-lookup?subdomain=${encodeURIComponent(clean)}`, {
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      if (!data.exists) {
        setNotFound(true);
        setChecking(false);
        return;
      }
    } catch {
      // Lookup itself failed (network blip, etc.) — fail open rather than
      // trap the visitor in the modal. The tenant subdomain's own
      // ResolveTenant handling covers a genuinely wrong address either way.
    }

    window.location.href = `//${clean}.${tenantDomain}/login`;
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-xl transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Sign in to your store</h2>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink" aria-label="Close">✕</button>
            </div>
            <p className="mt-1 text-sm text-muted">What's your store's address?</p>

            <div className="mt-4 flex items-center rounded-lg border border-hairline bg-canvas px-3 py-2">
              <input
                autoFocus
                value={subdomain}
                onChange={(e) => {
                  setSubdomain(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""));
                  setNotFound(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && go()}
                placeholder="yourstore"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <span className="shrink-0 text-sm text-muted">.{tenantDomain}</span>
            </div>

            {notFound && (
              <p className="mt-2 text-xs text-red-500">
                We couldn't find a store at "{subdomain}.{tenantDomain}" — check the spelling, or your welcome
                email.
              </p>
            )}

            <button
              onClick={go}
              disabled={!subdomain.trim() || checking}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {checking ? "Checking…" : "Continue"}
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              Don't know your store address? Check the welcome email from when you signed up.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
