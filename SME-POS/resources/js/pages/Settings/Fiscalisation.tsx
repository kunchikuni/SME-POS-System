import { useState, useEffect } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import UpgradeRequired from "../../Components/UpgradeRequired.js";
import { usePageTitle, useQuery, useMutation } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";
import { SettingsTabs } from "./SettingsTabs.js";

interface FiscalDevice {
  zimraDeviceId: number | null;
  deviceSerialNo: string | null;
  deviceModelName: string;
  deviceModelVersion: string;
  environment: "test" | "production";
  hasActivationKey: boolean;
  taxpayerName: string | null;
  taxpayerTin: string | null;
  vatNumber: string | null;
  deviceBranchName: string | null;
  verifiedAt: string | null;
  isRegistered: boolean;
  fiscalDayStatus: string;
}

const DEFAULT_DEVICE: FiscalDevice = {
  zimraDeviceId: null,
  deviceSerialNo: null,
  deviceModelName: "",
  deviceModelVersion: "1",
  environment: "test",
  hasActivationKey: false,
  taxpayerName: null,
  taxpayerTin: null,
  vatNumber: null,
  deviceBranchName: null,
  verifiedAt: null,
  isRegistered: false,
  fiscalDayStatus: "not_opened",
};

/**
 * ZIMRA Fiscalisation settings. Built against FDMS API spec v7.2.
 * "Verify" makes a real call to ZIMRA's public verifyTaxpayerInformation endpoint.
 */
export default function FiscalisationSettings() {
  usePageTitle("Fiscalisation");
  const { data, loading, errorInfo, refetch } = useQuery(() => api.fiscalisation.get(), []);

  const [enabled, setEnabled] = useState(false);
  const [device, setDevice] = useState<FiscalDevice>(DEFAULT_DEVICE);
  const [deviceForm, setDeviceForm] = useState({
    zimraDeviceId: "",
    activationKey: "",
    deviceSerialNo: "",
    deviceModelName: "",
    deviceModelVersion: "1",
    environment: "test" as "test" | "production",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setEnabled((data as any).zimraEnabled ?? false);
      const d: FiscalDevice = {
        ...DEFAULT_DEVICE,
        ...((data as any).device ?? {}),
      };
      setDevice(d);
      setDeviceForm({
        zimraDeviceId: d.zimraDeviceId?.toString() ?? "",
        activationKey: "",
        deviceSerialNo: d.deviceSerialNo ?? "",
        deviceModelName: d.deviceModelName,
        deviceModelVersion: d.deviceModelVersion,
        environment: d.environment,
      });
    }
  }, [data]);

  const { submit: toggle, loading: toggling } = useMutation(
    () => api.fiscalisation.toggle(),
    {
      onSuccess: (r: any) => {
        setEnabled(r?.zimraEnabled ?? !enabled);
        refetch();
      },
    }
  );

  const { submit: saveDevice, loading: savingDevice, errors: deviceErrors } = useMutation(
    (d: typeof deviceForm) => api.fiscalisation.saveDevice({
      zimra_device_id: d.zimraDeviceId ? Number(d.zimraDeviceId) : null,
      activation_key: d.activationKey || undefined,
      device_serial_no: d.deviceSerialNo,
      device_model_name: d.deviceModelName,
      device_model_version: d.deviceModelVersion,
      environment: d.environment,
    }),
    {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        refetch();
      },
    }
  );

  const { submit: verify, loading: verifying } = useMutation(
    () => api.fiscalisation.verify(),
    { onSuccess: () => refetch() }
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="mt-8 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  // Fiscalisation is Premium-only: a plan without it gets a 403 and no data,
  // which used to render this config form empty, as though it were usable.
  if (errorInfo?.code === "plan_upgrade_required") {
    return (
      <AppLayout>
        <UpgradeRequired feature={errorInfo.feature ?? "fiscalisation"} plan={errorInfo.plan} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
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
            onClick={() => toggle(undefined as any)}
            disabled={toggling}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              enabled ? "bg-green-600 text-white" : "bg-canvas text-muted"
            }`}
          >
            {enabled ? "Enabled" : "Disabled"}
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
              {device.fiscalDayStatus.replace(/_/g, " ")}
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

        <form
          onSubmit={(e) => { e.preventDefault(); saveDevice(deviceForm); }}
          className="rounded-xl border border-hairline bg-surface p-5"
        >
          <h2 className="font-semibold text-ink">🔌 Device Credentials</h2>
          <p className="mt-1 text-xs text-muted">From your ZIMRA portal registration.</p>

          <div className="mt-4 space-y-4">
            <Field label="Device ID" error={deviceErrors.zimra_device_id}>
              <input
                inputMode="numeric"
                placeholder="e.g. 187"
                value={deviceForm.zimraDeviceId}
                onChange={(e) => setDeviceForm(f => ({ ...f, zimraDeviceId: e.target.value }))}
                className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>

            <Field label="Activation Key" error={deviceErrors.activation_key}>
              <input
                placeholder={device.hasActivationKey ? "•••••••• (saved — re-enter to change)" : "8-character key"}
                maxLength={8}
                value={deviceForm.activationKey}
                onChange={(e) => setDeviceForm(f => ({ ...f, activationKey: e.target.value.toUpperCase() }))}
                className="w-full rounded-lg border border-hairline px-3 py-2 font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>

            <Field label="Device Serial No." error={deviceErrors.device_serial_no}>
              <input
                placeholder="SN-XXXXXXXXXXXX"
                value={deviceForm.deviceSerialNo}
                onChange={(e) => setDeviceForm(f => ({ ...f, deviceSerialNo: e.target.value }))}
                className="w-full rounded-lg border border-hairline px-3 py-2 font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>

            <Field label="Device Model Name">
              <input
                value={deviceForm.deviceModelName}
                onChange={(e) => setDeviceForm(f => ({ ...f, deviceModelName: e.target.value }))}
                className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </Field>

            <Field label="Environment">
              <select
                value={deviceForm.environment}
                onChange={(e) => setDeviceForm(f => ({ ...f, environment: e.target.value as "test" | "production" }))}
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
              disabled={savingDevice}
              className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {savingDevice ? "Saving…" : "Save credentials"}
            </button>
            <button
              type="button"
              onClick={() => verify(undefined as any)}
              disabled={verifying || !device.deviceSerialNo}
              className="flex-1 rounded-lg border border-hairline py-2.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
            >
              {verifying ? "Verifying…" : "Verify with ZIMRA"}
            </button>
          </div>
          {saved && <p className="mt-2 text-sm text-green-600">Credentials saved.</p>}
        </form>

        {device.verifiedAt && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm">
            <p className="font-semibold text-green-800">Verified taxpayer</p>
            <dl className="mt-2 space-y-1 text-green-700">
              <div className="flex justify-between"><dt>Name</dt><dd>{device.taxpayerName}</dd></div>
              <div className="flex justify-between"><dt>TIN</dt><dd>{device.taxpayerTin}</dd></div>
              {device.vatNumber && (
                <div className="flex justify-between"><dt>VAT No.</dt><dd>{device.vatNumber}</dd></div>
              )}
              {device.deviceBranchName && (
                <div className="flex justify-between"><dt>Branch</dt><dd>{device.deviceBranchName}</dd></div>
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
