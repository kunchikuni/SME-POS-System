import { Head, useForm, usePage } from "@inertiajs/react";
import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface Manager {
  id: string;
  name: string;
}
interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_default: boolean;
  is_active: boolean;
  manager: string | null;
  manager_id: string | null;
  staff_count: number;
  revenue_cents: number;
}
interface Props {
  branches: Branch[];
  managers: Manager[];
  summary: {
    total_branches: number;
    active_branches: number;
    total_staff: number;
    combined_revenue_cents: number;
  };
  [key: string]: unknown;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function BranchesIndex() {
  const { branches, managers, summary } = usePage<Props>().props;
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  return (
    <AppLayout>
      <Head title="Branches" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Branches</h1>
          <p className="mt-1 text-sm text-slate-500">
            {summary.total_branches} location{summary.total_branches === 1 ? "" : "s"} ·{" "}
            {summary.total_staff} total staff · {money(summary.combined_revenue_cents)} combined revenue
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Branch
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Combined Revenue" value={money(summary.combined_revenue_cents)} />
        <SummaryCard label="Total Staff" value={String(summary.total_staff)} />
        <SummaryCard label="Active Branches" value={String(summary.active_branches)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {branches.map((b) => (
          <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{b.name}</h2>
                  {b.is_default && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      MAIN
                    </span>
                  )}
                </div>
                {b.address && <p className="text-sm text-slate-500">📍 {b.address}</p>}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  b.is_active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {b.is_active ? "active" : "inactive"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-lg font-semibold tabular-nums text-slate-900">
                  {money(b.revenue_cents)}
                </div>
                <div className="text-xs text-slate-400">Revenue</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-lg font-semibold tabular-nums text-slate-900">{b.staff_count}</div>
                <div className="text-xs text-slate-400">Staff</div>
              </div>
            </div>

            {b.manager && (
              <p className="mt-3 text-sm text-slate-600">
                Manager: <span className="font-medium text-slate-800">{b.manager}</span>
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditing(b)}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
              {!b.is_default && (
                <DeleteButton branch={b} />
              )}
            </div>
          </div>
        ))}
      </div>

      {(showAdd || editing) && (
        <BranchModal
          branch={editing}
          managers={managers}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
        />
      )}
    </AppLayout>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function DeleteButton({ branch }: { branch: Branch }) {
  const form = useForm({});
  function destroy() {
    if (!confirm(`Remove ${branch.name}? This can't be undone.`)) return;
    form.delete(`/branches/${branch.id}`, { preserveScroll: true });
  }
  return (
    <button
      onClick={destroy}
      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
    >
      Delete
    </button>
  );
}

function BranchModal({
  branch,
  managers,
  onClose,
}: {
  branch: Branch | null;
  managers: Manager[];
  onClose: () => void;
}) {
  const form = useForm({
    name: branch?.name ?? "",
    address: branch?.address ?? "",
    phone: branch?.phone ?? "",
    manager_id: branch?.manager_id ?? "",
    is_active: branch?.is_active ?? true,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const onSuccess = () => onClose();
    if (branch) {
      form.patch(`/branches/${branch.id}`, { preserveScroll: true, onSuccess });
    } else {
      form.post("/branches", { preserveScroll: true, onSuccess });
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">{branch ? "Edit branch" : "Add branch"}</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
            <input
              value={form.data.name}
              onChange={(e) => form.setData("name", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
            {form.errors.name && <p className="mt-1 text-sm text-red-600">{form.errors.name}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
            <input
              value={form.data.address}
              onChange={(e) => form.setData("address", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
            <input
              value={form.data.phone}
              onChange={(e) => form.setData("phone", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Manager</label>
            <select
              value={form.data.manager_id}
              onChange={(e) => form.setData("manager_id", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">— None —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {branch && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.data.is_active}
                onChange={(e) => form.setData("is_active", e.target.checked)}
              />
              Active
            </label>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={form.processing}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {form.processing ? "Saving…" : branch ? "Save changes" : "Add branch"}
          </button>
        </div>
      </form>
    </div>
  );
}
