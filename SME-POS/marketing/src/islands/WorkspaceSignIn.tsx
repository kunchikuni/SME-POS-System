import { useState, type FormEvent } from "react";
import { API_URL, TENANT_SUFFIX, workspaceLoginUrl } from "../config";

/**
 * "Sign in to your workspace" — existing customers' way back in from the
 * marketing page. Sign-in only works on a business's own workspace address,
 * so this asks which one, checks it exists (/api/tenant-lookup), and sends
 * the visitor to that workspace's sign-in page.
 *
 * Replaces the "Install the till app" section: installing the till is now
 * handled inside the product (the Get selling checklist's "Open the till"
 * for the first device, Devices → Add device for more), where the device
 * token that pairing needs actually is.
 */
export default function WorkspaceSignIn() {
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
        setError(`No workspace called "${ws}". It's the name in your dashboard's address.`);
        return;
      }
      window.location.href = workspaceLoginUrl(ws);
    } catch {
      setError("Couldn't check that right now — are you online?");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-3xl border border-hairline bg-surface p-8 md:flex-row md:items-center md:p-10">
      <div className="flex-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-500">Already selling with Wivae?</p>
        <h2 className="font-display text-2xl font-bold tracking-tight">Sign in to your workspace</h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Your workspace is the name you chose when you signed up — it's in your dashboard's address.
        </p>
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
          {checking ? "Checking…" : "Sign in →"}
        </button>
      </form>
    </div>
  );
}
