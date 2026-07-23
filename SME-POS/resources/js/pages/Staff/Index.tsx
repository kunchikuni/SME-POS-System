import { Head, useForm, usePage } from "@inertiajs/react";
import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface Branch {
    id: string;
    name: string;
}
interface RoleOption {
    value: string;
    label: string;
}
interface StaffMember {
    id: string;
    name: string;
    email: string | null;
    role: string;
    branch: string | null;
    branch_id: string | null;
    has_pin: boolean;
    dashboard: boolean;
}
interface Credential {
    name: string;
    kind: "pin" | "password";
    value: string;
}
interface Props {
    staff: StaffMember[];
    branches: Branch[];
    roles: RoleOption[];
    flash?: { staffCredential?: Credential | null };
    [key: string]: unknown;
}

const ROLE_TINT: Record<string, string> = {
    owner: "bg-purple-50 text-purple-700",
    manager: "bg-blue-50 text-blue-700",
    cashier: "bg-green-50 text-green-700",
    waiter: "bg-amber-50 text-amber-700",
};

/**
 * Staff identity, role, branch, and till access. Owner/Manager get a
 * dashboard password; Cashier/Waiter are till-only (name, role, branch, PIN —
 * no email, no password, can't sign into the dashboard at all).
 */
export default function StaffIndex() {
    const { staff, branches, roles, flash } = usePage<Props>().props;
    const credential = flash?.staffCredential ?? null;
    const [showAdd, setShowAdd] = useState(false);
    const [editing, setEditing] = useState<StaffMember | null>(null);

    return (
        <AppLayout>
            <Head title="Staff" />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-ink">Staff</h1>
                    <p className="mt-1 text-sm text-muted">
                        Identity, role, and till access — not scheduling or payroll.
                    </p>
                </div>
                <button
                    onClick={() => setShowAdd(true)}
                    className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
                >
                    + Add staff
                </button>
            </div>

            {credential && <CredentialReveal credential={credential} />}

            <div className="mt-6 overflow-hidden rounded-xl border border-hairline bg-surface">
                {staff.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted">No staff yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-canvas text-left text-xs text-muted">
                            <tr>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Role</th>
                                <th className="px-4 py-3 font-medium">Branch</th>
                                <th className="px-4 py-3 font-medium">Access</th>
                                <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            {staff.map((s) => (
                                <StaffRow key={s.id} member={s} onEdit={() => setEditing(s)} />
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {(showAdd || editing) && (
                <StaffModal
                    member={editing}
                    branches={branches}
                    roles={roles}
                    onClose={() => {
                        setShowAdd(false);
                        setEditing(null);
                    }}
                />
            )}
        </AppLayout>
    );
}

function StaffRow({ member, onEdit }: { member: StaffMember; onEdit: () => void }) {
    const resetPinForm = useForm({});
    const resetPasswordForm = useForm({});
    const deactivateForm = useForm({});

    return (
        <tr className="border-t border-hairline">
            <td className="px-4 py-3 font-medium text-ink">{member.name}</td>
            <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_TINT[member.role] ?? "bg-canvas text-muted"}`}>
          {member.role}
        </span>
            </td>
            <td className="px-4 py-3 text-muted">{member.branch ?? "—"}</td>
            <td className="px-4 py-3 text-muted">
                {member.dashboard ? "Dashboard + till" : "Till only"}
            </td>
            <td className="px-4 py-3">
                <div className="flex justify-end gap-1 text-xs">
                    <button onClick={onEdit} className="rounded px-2 py-1 text-muted hover:bg-canvas">
                        Edit
                    </button>
                    <button
                        onClick={() => resetPinForm.post(`/staff/${member.id}/reset-pin`, { preserveScroll: true })}
                        className="rounded px-2 py-1 text-muted hover:bg-canvas"
                    >
                        Reset PIN
                    </button>
                    {member.dashboard && (
                        <button
                            onClick={() => resetPasswordForm.post(`/staff/${member.id}/reset-password`, { preserveScroll: true })}
                            className="rounded px-2 py-1 text-muted hover:bg-canvas"
                        >
                            Reset password
                        </button>
                    )}
                    {member.role !== "owner" && (
                        <button
                            onClick={() => {
                                if (confirm(`Deactivate ${member.name}? They'll lose access immediately.`)) {
                                    deactivateForm.delete(`/staff/${member.id}`, { preserveScroll: true });
                                }
                            }}
                            className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                        >
                            Deactivate
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

function CredentialReveal({ credential }: { credential: Credential }) {
    return (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
                {credential.kind === "pin" ? "Till PIN" : "Temporary password"} for{" "}
                <span className="font-medium">{credential.name}</span> — copy this now, it won't be shown again.
            </p>
            <p className="mt-2 font-mono text-lg font-semibold text-amber-900">{credential.value}</p>
        </div>
    );
}

function StaffModal({
                        member,
                        branches,
                        roles,
                        onClose,
                    }: {
    member: StaffMember | null;
    branches: Branch[];
    roles: RoleOption[];
    onClose: () => void;
}) {
    const form = useForm({
        name: member?.name ?? "",
        role: member?.role ?? "cashier",
        branch_id: member?.branch_id ?? "",
        email: member?.email ?? "",
    });

    const needsEmail = ["owner", "manager"].includes(form.data.role);

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const onSuccess = () => onClose();
        if (member) {
            form.patch(`/staff/${member.id}`, { preserveScroll: true, onSuccess });
        } else {
            form.post("/staff", { preserveScroll: true, onSuccess });
        }
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 sm:p-6" onClick={onClose}>
            <form
                onSubmit={submit}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl"
            >
                <h2 className="text-lg font-semibold text-ink">{member ? "Edit staff" : "Add staff"}</h2>

                <div className="mt-4 space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-ink">Name</label>
                        <input
                            value={form.data.name}
                            onChange={(e) => form.setData("name", e.target.value)}
                            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            required
                        />
                        {form.errors.name && <p className="mt-1 text-sm text-red-600">{form.errors.name}</p>}
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-ink">Role</label>
                        <select
                            value={form.data.role}
                            onChange={(e) => form.setData("role", e.target.value)}
                            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                        >
                            {roles.map((r) => (
                                <option key={r.value} value={r.value}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-muted">
                            {needsEmail
                                ? "Owners and managers get a dashboard login (email + a one-time temporary password)."
                                : "Cashiers and waiters are till-only — a PIN, no dashboard access."}
                        </p>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-ink">Branch</label>
                        <select
                            value={form.data.branch_id}
                            onChange={(e) => form.setData("branch_id", e.target.value)}
                            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                        >
                            <option value="">— None —</option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {needsEmail && (
                        <div>
                            <label className="mb-1 block text-sm font-medium text-ink">Email</label>
                            <input
                                type="email"
                                value={form.data.email}
                                onChange={(e) => form.setData("email", e.target.value)}
                                className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                            {form.errors.email && <p className="mt-1 text-sm text-red-600">{form.errors.email}</p>}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-lg border border-hairline py-2.5 text-sm font-medium text-ink hover:bg-canvas"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={form.processing}
                        className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                        {form.processing ? "Saving…" : member ? "Save changes" : "Add staff"}
                    </button>
                </div>
            </form>
        </div>
    );
}
