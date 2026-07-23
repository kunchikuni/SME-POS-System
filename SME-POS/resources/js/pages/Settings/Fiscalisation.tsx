import { Head, useForm, usePage } from "@inertiajs/react";
import AppLayout from "../../Layouts/AppLayout";
import { SettingsTabs } from "./SettingsTabs";

interface Device {
    zimra_device_id: number | null;
    device_serial_no: string | null;
    device_model_name: string;
    device_model_version: string;
    environment: "test" | "production";
    has_activation_key: boolean;
    taxpayer_name: string | null;
    taxpayer_tin: string | null;
    vat_number: string | null;
    device_branch_name: string | null;
    verified_at: string | null;
    is_registered: boolean;
    fiscal_day_status: string;
}
interface Props {
    enabled: boolean;
    device: Device;
    [key: string]: unknown;
}

/**
 * ZIMRA Fiscalisation. Built against the actual Fiscal Device Gateway API
 * Specification v7.2 (fetched from zimra.co.zw, not memory). "Verify" below
 * makes a real call to ZIMRA's public verifyTaxpayerInformation endpoint —
 * everything past that (device registration, opening a fiscal day, signing
 * receipts) needs real cryptography and ZIMRA test credentials to build
 * safely, and isn't faked here.
 */
export default function FiscalisationSettings({ enabled, device }: Props) {
    const toggleForm = useForm({ enabled });
    const deviceForm = useForm({
        zimra_device_id: device.zimra_device_id ?? "",
        activation_key: "",
        device_serial_no: device.device_serial_no ?? "",
        device_model_name: device.device_model_name,
        device_model_version: device.device_model_version,
        environment: device.environment,
    });
    const verifyForm = useForm({});

    function toggle() {
        const next = !toggleForm.data.enabled;
        toggleForm.setData("enabled", next);
        toggleForm.patch("/settings/fiscalisation/toggle", { preserveScroll: true });
    }

    function saveDevice(e: React.FormEvent) {
        e.preventDefault();
        deviceForm.post("/settings/fiscalisation/device", { preserveScroll: true });
    }

    function verify() {
        verifyForm.post("/settings/fiscalisation/verify", { preserveScroll: true });
    }

    return (
        <AppLayout>
            <Head title="Fiscalisation" />
            <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
            <p className="mt-1 text-sm text-muted">Manage your store configuration</p>
            <SettingsTabs active="fiscalisation" />

            <div className="mt-6 max-w-xl space-y-6">
                <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface p-5">
                    <div>
                        <h2 className="font-semibold text-ink">ZIMRA FDMS device configuration</h2>
                        <p className="mt-1 text-sm text-muted">Fiscal device registration and fiscal day management.</p>
                    </div>
                    <button
                        onClick={toggle}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            toggleForm.data.enabled ? "bg-green-600 text-white" : "bg-canvas text-muted"
                        }`}
                    >
                        {toggleForm.data.enabled ? "Enabled" : "Disabled"}
                    </button>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-medium">This is a config screen, not a live fiscal connection yet.</p>
                    <p className="mt-1">
                        <strong>Verify</strong> below makes a real, read-only call to ZIMRA to confirm your Device ID and
                        Activation Key resolve to your taxpayer record. Device registration, fiscal day open/close, and
                        receipt signing require real cryptographic signing and are not wired in yet.
                    </p>
                </div>

                <div className="rounded-xl border border-hairline bg-surface p-5">
                    <h2 className="font-semibold text-ink">Fiscal Day Status</h2>
                    <p className="mt-1 text-sm text-muted">
                        Open a new fiscal day at the start of each shift. Close it before signing out.
                    </p>
                    <div className="mt-3 flex gap-3">
            <span className="flex-1 rounded-lg bg-canvas px-4 py-3 text-center text-sm font-medium capitalize text-muted">
              {device.fiscal_day_status.replace(/_/g, " ")}
            </span>
                        <button
                            disabled
                            title="Requires device registration first"
                            className="flex-1 rounded-lg bg-canvas px-4 py-3 text-sm font-medium text-muted"
                        >
                            Open Fiscal Day
                        </button>
                    </div>
                </div>

                <form onSubmit={saveDevice} className="rounded-xl border border-hairline bg-surface p-5">
                    <h2 className="font-semibold text-ink">🔌 Device Credentials</h2>
                    <p className="mt-1 text-xs text-muted">From your ZIMRA portal registration.</p>

                    <div className="mt-4 space-y-4">
                        <Field label="Device ID" error={deviceForm.errors.zimra_device_id}>
                            <input
                                inputMode="numeric"
                                placeholder="e.g. 187"
                                value={deviceForm.data.zimra_device_id}
                                onChange={(e) => deviceForm.setData("zimra_device_id", e.target.value)}
                                className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                        </Field>

                        <Field label="Activation Key" error={deviceForm.errors.activation_key}>
                            <input
                                placeholder={device.has_activation_key ? "•••••••• (saved — re-enter to change)" : "8-character key"}
                                maxLength={8}
                                value={deviceForm.data.activation_key}
                                onChange={(e) => deviceForm.setData("activation_key", e.target.value.toUpperCase())}
                                className="w-full rounded-lg border border-hairline px-3 py-2 font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                        </Field>

                        <Field label="Device Serial No." error={deviceForm.errors.device_serial_no}>
                            <input
                                placeholder="SN-XXXXXXXXXXXX"
                                value={deviceForm.data.device_serial_no}
                                onChange={(e) => deviceForm.setData("device_serial_no", e.target.value)}
                                className="w-full rounded-lg border border-hairline px-3 py-2 font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                        </Field>

                        <Field label="Device Model Name">
                            <input
                                value={deviceForm.data.device_model_name}
                                onChange={(e) => deviceForm.setData("device_model_name", e.target.value)}
                                className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                        </Field>

                        <Field label="Environment">
                            <select
                                value={deviceForm.data.environment}
                                onChange={(e) => deviceForm.setData("environment", e.target.value as "test" | "production")}
                                className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            >
                                <option value="test">Test (fdmsapitest.zimra.co.zw)</option>
                                <option value="production">Production (fdmsapi.zimra.co.zw)</option>
                            </select>
                        </Field>
                    </div>

                    <div className="mt-5 flex gap-3">
                        <button
                            type="submit"
                            disabled={deviceForm.processing}
                            className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                        >
                            {deviceForm.processing ? "Saving…" : "Save credentials"}
                        </button>
                        <button
                            type="button"
                            onClick={verify}
                            disabled={verifyForm.processing || !device.device_serial_no}
                            className="flex-1 rounded-lg border border-hairline py-2.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
                        >
                            {verifyForm.processing ? "Verifying…" : "Verify with ZIMRA"}
                        </button>
                    </div>
                </form>

                {device.verified_at && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm">
                        <p className="font-semibold text-green-800">Verified taxpayer</p>
                        <dl className="mt-2 space-y-1 text-green-700">
                            <div className="flex justify-between"><dt>Name</dt><dd>{device.taxpayer_name}</dd></div>
                            <div className="flex justify-between"><dt>TIN</dt><dd>{device.taxpayer_tin}</dd></div>
                            {device.vat_number && (
                                <div className="flex justify-between"><dt>VAT No.</dt><dd>{device.vat_number}</dd></div>
                            )}
                            {device.device_branch_name && (
                                <div className="flex justify-between"><dt>Branch</dt><dd>{device.device_branch_name}</dd></div>
                            )}
                        </dl>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
            {children}
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>
    );
}
