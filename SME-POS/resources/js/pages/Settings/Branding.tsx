import { Head, useForm } from "@inertiajs/react";
import type { FormEvent } from "react";
import AppLayout from "../../Layouts/AppLayout";
import { SettingsTabs } from "./SettingsTabs";

interface Branding {
    name: string;
    subdomain: string;
    primary: string;
    accent: string;
    logo_url: string | null;
}
interface Props {
    branding: Branding;
    tenantDomain: string;
    [key: string]: unknown;
}

export default function BrandingSettings({ branding, tenantDomain }: Props) {
    const form = useForm({
        name: branding.name,
        primary: branding.primary,
        accent: branding.accent,
        logo_url: branding.logo_url ?? "",
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        form.patch("/settings/branding", { preserveScroll: true });
    }

    return (
        <AppLayout>
            <Head title="Branding" />
            <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
            <p className="mt-1 text-sm text-muted">Manage your store configuration</p>
            <SettingsTabs active="branding" />

            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Form */}
                <form onSubmit={submit} className="space-y-5">
                    <Field label="Business name" error={form.errors.name}>
                        <input
                            value={form.data.name}
                            onChange={(e) => form.setData("name", e.target.value)}
                            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                        />
                    </Field>

                    <Field label="Subdomain">
                        <div className="flex items-center rounded-lg border border-hairline bg-canvas px-3 py-2 text-muted">
                            <span className="font-medium text-ink">{branding.subdomain}</span>
                            <span>.{tenantDomain}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted">Set at signup — contact support to change it.</p>
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Primary colour" error={form.errors.primary}>
                            <ColorInput value={form.data.primary} onChange={(v) => form.setData("primary", v)} />
                        </Field>
                        <Field label="Accent colour" error={form.errors.accent}>
                            <ColorInput value={form.data.accent} onChange={(v) => form.setData("accent", v)} />
                        </Field>
                    </div>

                    <Field label="Logo URL" error={form.errors.logo_url}>
                        <input
                            value={form.data.logo_url}
                            onChange={(e) => form.setData("logo_url", e.target.value)}
                            placeholder="https://…/logo.png"
                            className="w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                        />
                    </Field>

                    <button
                        type="submit"
                        disabled={form.processing}
                        className="rounded-lg bg-brand-500 px-5 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                        {form.processing ? "Saving…" : "Save branding"}
                    </button>
                    {form.recentlySuccessful && <span className="ml-3 text-sm text-green-600">Saved.</span>}
                </form>

                {/* Live preview */}
                <div>
                    <p className="mb-2 text-sm font-medium text-ink">Preview</p>
                    <div className="overflow-hidden rounded-xl border border-hairline">
                        <div
                            className="flex items-center gap-3 px-4 py-3 text-white"
                            style={{ backgroundColor: form.data.primary }}
                        >
                            {form.data.logo_url ? (
                                <img src={form.data.logo_url} alt="" className="h-6 w-auto" />
                            ) : (
                                <span className="font-semibold">{form.data.name || "Your business"}</span>
                            )}
                        </div>
                        <div className="space-y-3 bg-surface p-4">
                            <div className="h-2 w-2/3 rounded bg-canvas" />
                            <div className="h-2 w-1/2 rounded bg-canvas" />
                            <button
                                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                                style={{ backgroundColor: form.data.accent }}
                                type="button"
                            >
                                Sample action
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

function Field({
                   label,
                   error,
                   children,
               }: {
    label: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
            {children}
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>
    );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-hairline"
            />
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-lg border border-hairline px-3 py-2 font-mono text-sm uppercase outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            />
        </div>
    );
}
