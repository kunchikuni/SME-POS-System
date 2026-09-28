import { useState, type FormEvent } from "react";
import { API_URL, TENANT_SUFFIX, tillUrl } from "../config";

/**
 * "Install the till app" — the marketing page's way into the system for a
 * device that will run a till. Modelled on WiLogix's install section, but it
 * can't install from here: the till is a PWA scoped to each business's own
 * workspace origin ({workspace}.domain/pos/), and browsers only install an
 * app from the origin it lives on. So this checks the workspace exists
 * (/api/tenant-lookup) and sends the device there with ?install=1, where the
 * pairing screen leads with a one-tap install card. Once installed, the app
 * opens straight to pairing → cashier PIN → till.
 */
export default function InstallTill() {
  const [workspace, setWorkspace] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: FormEvent) {
    e.preventDefault();
    const ws = workspace.trim().toLowerCase().replace(TENANT_SUFFIX, "");
    if (!/^[a-z0-9-]{3,30}$/.test(ws)) {
      setError("Workspace names are 3–30 letters, numbers or dashes.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/tenant-lookup?subdomain=${encodeURIComponent(ws)}`);
      const body = (await res.json()) as { exists?: boolean };
      if (!body.exists) {
        setError(`No workspace called "${ws}". Check the name your owner signed up with.`);
        return;
      }
      window.location.href = tillUrl(ws);
    } catch {
      setError("Couldn't check that right now — are you online?");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 rounded-2xl border border-hairline bg-surface p-8 md:flex-row md:items-center md:p-10">
      <div className="flex-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-500">Install the till app</p>
        <h2 className="font-display text-2xl font-bold tracking-tight">Put Wivae on your counter device</h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
          No app store needed. Enter your workspace, install the till from your browser, then pair it with the
          device token from your dashboard (Devices → Add device). It opens full-screen from your home screen and
          keeps selling offline.
        </p>
        <div className="mt-5 grid max-w-lg grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-xl bg-canvas p-3">
            <p className="mb-1 font-semibold uppercase tracking-wide text-muted">Android / Chrome / Edge</p>
            <p>One tap on <strong>Install</strong> on the pairing screen.</p>
          </div>
          <div className="rounded-xl bg-canvas p-3">
            <p className="mb-1 font-semibold uppercase tracking-wide text-muted">iPhone / iPad</p>
            <p>Safari → <strong>Share</strong> → <strong>Add to Home Screen</strong>.</p>
          </div>
        </div>
      </div>

      <form onSubmit={go} className="w-full shrink-0 md:w-80">
        <label htmlFor="workspace" className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted">
          Your workspace
        </label>
        <div className="flex items-center rounded-xl border border-hairline bg-canvas pr-3 focus-within:ring-2 focus-within:ring-brand-500/30">
          <input
            id="workspace"
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourshop"
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none"
          />
          <span className="text-sm text-muted">{TENANT_SUFFIX}</span>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={checking || workspace.trim() === ""}
          className="mt-3 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Open & install the till →"}
        </button>
      </form>
    </div>
  );
}
