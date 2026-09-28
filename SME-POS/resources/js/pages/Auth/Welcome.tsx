import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import { usePageTitle } from "../../lib/hooks.js";

/**
 * Landing page on the new workspace right after sign-up. Trades the
 * one-time hand-off token (server/src/lib/handoff.ts) for a session, so the
 * owner arrives signed in instead of retyping the password they just chose.
 *
 * The token arrives in the URL fragment (#t=…): fragments aren't sent to the
 * server or recorded in access logs, and it's wiped from the address bar
 * before anything else happens, so a copied link or the back button can't
 * replay it (it's single-use and expires in 2 minutes regardless).
 */
export default function Welcome() {
  usePageTitle("Welcome");
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // StrictMode runs effects twice in dev; the token is single-use

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setError("This sign-in link is incomplete.");
      return;
    }
    api.auth.welcome(token)
      .then(async () => {
        await refetch();
        navigate("/dashboard?welcome=1", { replace: true });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't sign you in."));
  }, [navigate, refetch]);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
      {error ? (
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold text-ink">Your store is ready</h1>
          <p className="mt-2 text-sm text-muted">{error} Sign in with the email and password you just chose.</p>
          <Link to="/login?redirectTo=%2Fdashboard%3Fwelcome%3D1" className="btn-primary mt-5 inline-block text-sm">Sign in</Link>
        </div>
      ) : (
        <div>
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="mt-3 text-sm text-muted">Opening your store…</p>
        </div>
      )}
    </div>
  );
}
