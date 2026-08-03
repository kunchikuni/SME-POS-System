import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api, type StaffMember } from "../../lib/api.js";

const ROLE_TINT: Record<string, string> = {
  owner: "bg-purple-50 text-purple-700",
  manager: "bg-blue-50 text-blue-700",
  cashier: "bg-green-50 text-green-700",
  waiter: "bg-amber-50 text-amber-700",
};
const ROLES = ["owner", "manager", "cashier", "waiter"];

export default function StaffIndex() {
  usePageTitle("Staff");
  const { flash, showFlash } = useFlash();
  const { data, loading, refetch } = useQuery(() => api.staff.list(), []);
  const [showAdd, setShowAdd] = useState(false);
  const [credential, setCredential] = useState<{ name: string; kind: string; value: string } | null>(null);
  const [form, setForm] = useState({ name: "", role: "cashier", email: "", branchId: "", password: "" });

  const staff = data?.staff ?? [];
  const branches = data?.branches ?? [];

  const { submit: createStaff, loading: creating, errors, error } = useMutation(
    (d: typeof form) => api.staff.create(d),
    {
      onSuccess: (r) => {
        if (r?.staffCredential) setCredential(r.staffCredential);
        setShowAdd(false);
        setForm({ name: "", role: "cashier", email: "", branchId: "", password: "" });
        refetch();
        showFlash(`${form.name} added.`);
      },
    }
  );

  const { submit: deleteStaff } = useMutation(
    (id: string) => api.staff.delete(id),
    { onSuccess: () => { showFlash("Staff member removed."); refetch(); } }
  );

  const { submit: resetPin } = useMutation(
    (id: string) => api.staff.resetPin(id),
    { onSuccess: (r) => { if (r?.staffCredential) setCredential(r.staffCredential); } }
  );

  const isDashboardRole = ["owner", "manager"].includes(form.role);

  return (
    <AppLayout>
      {flash.message && <Flash message={flash.message} type={flash.type} />}

      {credential && (
        <div className="mb-4 rounded-xl border border-positive/30 bg-positive/5 p-4">
          <p className="text-sm font-semibold text-positive">
            {credential.name}'s {credential.kind}: <span className="font-mono text-ink">{credential.value}</span>
          </p>
          <p className="mt-1 text-xs text-muted">Save this now — it won't be shown again.</p>
          <button onClick={() => setCredential(null)} className="mt-2 text-xs text-muted hover:text-ink">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Staff</h1>
          <p className="mt-1 text-sm text-muted">Manage your team, roles, and access</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">+ Add Staff</button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center"><Spinner /></div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-canvas text-left text-xs font-semibold uppercase tracking-widest text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {staff.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No staff yet.</td></tr>}
              {staff.map((s: StaffMember) => (
                <tr key={s.id} className="hover:bg-canvas/50">
                  <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_TINT[s.role] ?? ""}`}>{s.role}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{s.branch ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{s.dashboard ? "Dashboard + Till" : "Till only"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {s.hasPin && (
                        <button onClick={() => resetPin(s.id)} className="rounded-lg border border-hairline px-2 py-1 text-xs hover:bg-canvas">Reset PIN</button>
                      )}
                      <button onClick={() => { if (confirm(`Remove ${s.name}?`)) deleteStaff(s.id); }}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add Staff Member" onClose={() => setShowAdd(false)}>
          {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="space-y-3">
            <Field label="Full name" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} error={errors.name} />
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full rounded-xl border border-hairline px-3 py-2 text-sm">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {branches.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Branch</label>
                <select value={form.branchId} onChange={(e) => setForm(f => ({ ...f, branchId: e.target.value }))}
                  className="w-full rounded-xl border border-hairline px-3 py-2 text-sm">
                  <option value="">— Any branch —</option>
                  {branches.map((b: { id: string; name: string }) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {isDashboardRole && (
              <>
                <Field label="Email" type="email" value={form.email} onChange={(v) => setForm(f => ({ ...f, email: v }))} error={errors.email} />
                <Field label="Password" type="password" value={form.password} onChange={(v) => setForm(f => ({ ...f, password: v }))} error={errors.password} />
              </>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={() => createStaff(form)} disabled={creating} className="btn-primary text-sm">
              {creating ? "Adding…" : "Add Staff"}
            </button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

function Field({ label, value, onChange, error, type = "text" }: { label: string; value: string; onChange: (v: string) => void; error?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-hairline px-3 py-2 text-sm" />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Flash({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>
      {message}
    </div>
  );
}

function Spinner() {
  return <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
