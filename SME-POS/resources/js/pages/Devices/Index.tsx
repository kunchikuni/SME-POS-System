import { Head, router, useForm, usePage } from "@inertiajs/react";
import type { FormEvent } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface Device {
  id: string;
  name: string;
  branch: { id: string; name: string } | null;
  last_seen_at: string | null;
}
interface Branch {
  id: string;
  name: string;
}
interface Props {
  devices: Device[];
  branches: Branch[];
  flash?: { deviceToken?: { name: string; token: string } | null };
  [key: string]: unknown;
}

export default function DevicesIndex() {
  const { devices, branches, flash } = usePage<Props>().props;
  const token = flash?.deviceToken ?? null;

  const form = useForm({ name: "", branch_id: branches[0]?.id ?? "" });

  function submit(e: FormEvent) {
    e.preventDefault();
    form.post("/devices", { onSuccess: () => form.reset("name") });
  }

  return (
    <AppLayout>
      <Head title="Tills" />
      <h1 className="font-display text-xl font-semibold tracking-tight">Tills</h1>
      <p className="mt-1 text-sm text-muted">
        Provision a till, then enter its token once on the device to pair it.
      </p>

      {token && (
        <div className="mt-4 rounded-xl border border-positive/30 bg-positive/5 p-4">
          <p className="text-sm font-medium text-positive">
            {token.name} paired. Copy this token now — it won't be shown again.
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-ink px-3 py-2 font-mono text-xs text-white">
            {token.token}
          </code>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 flex max-w-xl flex-wrap items-end gap-2">
        <label className="flex-1">
          <span className="text-sm font-medium">Till name</span>
          <input
            value={form.data.name}
            onChange={(e) => form.setData("name", e.target.value)}
            placeholder="Front counter"
            className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          />
        </label>
        <label>
          <span className="text-sm font-medium">Branch</span>
          <select
            value={form.data.branch_id}
            onChange={(e) => form.setData("branch_id", e.target.value)}
            className="mt-1 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={form.processing || !form.data.name || !form.data.branch_id}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          Provision
        </button>
      </form>
      {form.errors.name && <p className="mt-1 text-xs text-red-600">{form.errors.name}</p>}

      <ul className="mt-6 max-w-xl divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{d.name}</span>
              <span className="ml-2 text-muted">{d.branch?.name}</span>
            </span>
            <span className="flex items-center gap-3 text-muted">
              <span className="text-xs">
                {d.last_seen_at
                  ? `seen ${new Date(d.last_seen_at).toLocaleDateString()}`
                  : "never synced"}
              </span>
              <button
                onClick={() => confirm(`Remove ${d.name}?`) && router.delete(`/devices/${d.id}`)}
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
    </AppLayout>
  );
}
