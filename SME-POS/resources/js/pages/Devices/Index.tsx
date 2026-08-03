import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api, type Device, type Branch } from "../../lib/api.js";

function Flash({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>
      {message}
    </div>
  );
}

export default function DevicesIndex() {
  usePageTitle("Tills");
  const { flash, showFlash } = useFlash();
  const { data, loading, refetch } = useQuery(() => api.devices.list(), []);
  const [form, setForm] = useState({ name: "", branchId: "" });
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);

  const devices: Device[] = data?.devices ?? [];
  const branches: Branch[] = (data?.branches ?? []) as Branch[];

  const { submit: createDevice, loading: creating, errors } = useMutation(
    (d: { name: string; branchId: string }) => api.devices.create(d),
    {
      onSuccess: (r) => {
        if (r) setNewToken({ name: r.name, token: r.token });
        setForm({ name: "", branchId: "" });
        refetch();
      },
    }
  );

  const { submit: deleteDevice } = useMutation(
    (id: string) => api.devices.delete(id),
    { onSuccess: () => { showFlash("Device removed."); refetch(); } }
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.branchId) return;
    createDevice(form);
  }

  return (
    <AppLayout>
      {flash.message && <Flash message={flash.message} type={flash.type} />}

      <h1 className="font-display text-xl font-semibold tracking-tight">Tills</h1>
      <p className="mt-1 text-sm text-muted">
        Provision a till, then enter its token once on the device to pair it.
      </p>

      {newToken && (
        <div className="mt-4 rounded-xl border border-positive/30 bg-positive/5 p-4">
          <p className="text-sm font-medium text-positive">
            {newToken.name} provisioned. Copy this token now — it won't be shown again.
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-ink px-3 py-2 font-mono text-xs text-white">
            {newToken.token}
          </code>
          <button onClick={() => setNewToken(null)} className="mt-2 text-xs text-muted hover:text-ink">Dismiss</button>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 flex max-w-xl flex-wrap items-end gap-2">
        <label className="flex-1">
          <span className="text-sm font-medium">Till name</span>
          <input
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Front counter"
            className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          />
        </label>
        <label>
          <span className="text-sm font-medium">Branch</span>
          <select
            value={form.branchId}
            onChange={(e) => setForm(f => ({ ...f, branchId: e.target.value }))}
            className="mt-1 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          >
            <option value="">— Select branch —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={creating || !form.name || !form.branchId}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {creating ? "Provisioning…" : "Provision"}
        </button>
      </form>
      {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}

      {loading ? (
        <div className="mt-8 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <ul className="mt-6 max-w-xl divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{d.name}</span>
                <span className="ml-2 text-muted">{d.branch}</span>
              </span>
              <span className="flex items-center gap-3 text-muted">
                <span className="text-xs">
                  {d.lastSeenAt
                    ? `seen ${new Date(d.lastSeenAt).toLocaleDateString()}`
                    : "never synced"}
                </span>
                <button
                  onClick={() => confirm(`Remove ${d.name}?`) && deleteDevice(d.id)}
                  className="text-xs hover:text-red-600"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
          {devices.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">No tills provisioned yet.</li>
          )}
        </ul>
      )}
    </AppLayout>
  );
}
