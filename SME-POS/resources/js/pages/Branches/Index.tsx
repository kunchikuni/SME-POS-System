import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api, type Branch } from "../../lib/api.js";

const MODE_LABELS: Record<string, string> = {
  retail: "Retail",
  restaurant: "Restaurant",
  hardware: "Hardware",
  workshop: "Workshop",
};

const MODE_TINT: Record<string, string> = {
  retail: "bg-blue-50 text-blue-700",
  restaurant: "bg-amber-50 text-amber-700",
  hardware: "bg-slate-100 text-slate-700",
  workshop: "bg-purple-50 text-purple-700",
};

function Flash({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>
      {message}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, error, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-hairline px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function BranchesIndex() {
  usePageTitle("Branches");
  const { flash, showFlash } = useFlash();
  const { data, loading, refetch } = useQuery(() => api.branches.list(), []);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: "", address: "", mode: "retail" });

  const branches: Branch[] = data?.branches ?? [];

  const { submit: createBranch, loading: creating, errors: createErrors, error: createError } = useMutation(
    (d: typeof form) => api.branches.create(d),
    {
      onSuccess: () => {
        setShowAdd(false);
        setForm({ name: "", address: "", mode: "retail" });
        showFlash("Branch added.");
        refetch();
      },
    }
  );

  const { submit: updateBranch, loading: updating, errors: updateErrors, error: updateError } = useMutation(
    ({ id, data }: { id: string; data: typeof form }) => api.branches.update(id, data),
    {
      onSuccess: () => {
        setEditing(null);
        showFlash("Branch updated.");
        refetch();
      },
    }
  );

  const { submit: deleteBranch } = useMutation(
    (id: string) => api.branches.delete(id),
    {
      onSuccess: () => { showFlash("Branch removed."); refetch(); },
      // e.g. "Town still has 1 till paired" — the server refuses rather than
      // leave tills selling into a removed branch.
      onError: (err) => showFlash(err.message, "error"),
    }
  );

  const { submit: makeDefault } = useMutation(
    (id: string) => api.branches.update(id, { isDefault: true }),
    {
      onSuccess: () => { showFlash("Default branch changed."); refetch(); },
      onError: (err) => showFlash(err.message, "error"),
    }
  );

  function openAdd() {
    setForm({ name: "", address: "", mode: "retail" });
    setShowAdd(true);
  }

  function openEdit(b: Branch) {
    setForm({ name: b.name, address: b.address ?? "", mode: b.mode ?? "retail" });
    setEditing(b);
  }

  return (
    <AppLayout>
      {flash.message && <Flash message={flash.message} type={flash.type} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Branches</h1>
          <p className="mt-1 text-sm text-muted">Manage your locations and their till modes</p>
        </div>
        <button onClick={openAdd} className="btn-primary text-sm">+ Add Branch</button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-canvas text-left text-xs font-semibold uppercase tracking-widest text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {branches.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No branches yet.</td></tr>
              )}
              {branches.map((b) => (
                <tr key={b.id} className="hover:bg-canvas/50">
                  <td className="px-4 py-3 font-medium text-ink">
                    {b.name}
                    {b.isDefault && (
                      <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Default</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{b.address ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${MODE_TINT[b.mode] ?? ""}`}>
                      {MODE_LABELS[b.mode] ?? b.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.isActive ? "bg-green-50 text-green-700" : "bg-canvas text-muted"}`}>
                      {b.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(b)} className="rounded-lg border border-hairline px-2 py-1 text-xs hover:bg-canvas">Edit</button>
                      {!b.isDefault && (
                        <button
                          onClick={() => confirm(`Make ${b.name} the default branch? Restocks, new-product stock and CSV imports go here when no branch is chosen.`) && makeDefault(b.id)}
                          className="rounded-lg border border-hairline px-2 py-1 text-xs hover:bg-canvas"
                        >
                          Make default
                        </button>
                      )}
                      {!b.isDefault && (
                        <button
                          onClick={() => confirm(`Remove ${b.name}?`) && deleteBranch(b.id)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <Modal title="Add Branch" onClose={() => setShowAdd(false)}>
          {createError && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{createError}</p>}
          <div className="space-y-3">
            <Field label="Branch name" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} error={createErrors.name} />
            <Field label="Address (optional)" value={form.address} onChange={(v) => setForm(f => ({ ...f, address: v }))} />
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Mode</label>
              <select value={form.mode} onChange={(e) => setForm(f => ({ ...f, mode: e.target.value }))}
                className="w-full rounded-xl border border-hairline px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50">
                <option value="retail">Retail</option>
                <option value="restaurant">Restaurant</option>
                <option value="hardware">Hardware</option>
                <option value="workshop">Workshop</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={() => createBranch(form)} disabled={creating} className="btn-primary text-sm">
              {creating ? "Adding…" : "Add Branch"}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Branch" onClose={() => setEditing(null)}>
          {updateError && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{updateError}</p>}
          <div className="space-y-3">
            <Field label="Branch name" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} error={updateErrors.name} />
            <Field label="Address (optional)" value={form.address} onChange={(v) => setForm(f => ({ ...f, address: v }))} />
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Mode</label>
              <select value={form.mode} onChange={(e) => setForm(f => ({ ...f, mode: e.target.value }))}
                className="w-full rounded-xl border border-hairline px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50">
                <option value="retail">Retail</option>
                <option value="restaurant">Restaurant</option>
                <option value="hardware">Hardware</option>
                <option value="workshop">Workshop</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={() => updateBranch({ id: editing.id, data: form })} disabled={updating} className="btn-primary text-sm">
              {updating ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}
