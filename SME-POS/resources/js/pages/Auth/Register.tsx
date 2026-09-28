import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/hooks.js";
import { TENANT_DOMAIN, workspaceOrigin } from "../../lib/tenantDomain.js";

/** Must match TRIAL_DAYS in server/src/routes/auth.ts. */
const TRIAL_DAYS = 7;
const API_BASE = (import.meta.env.VITE_API_URL ?? "/api") as string;

const TYPES = [
    { value: "retail", label: "Shop", icon: "🛍", hint: "Counter sales" },
    { value: "restaurant", label: "Restaurant", icon: "🍽", hint: "Tables & kitchen" },
    { value: "hardware", label: "Hardware", icon: "🔧", hint: "Parts & job refs" },
    { value: "workshop", label: "Workshop", icon: "🚗", hint: "Services & jobs" },
] as const;

type Availability = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";

/** "Mai Tariro's Tuckshop" → "mai-tariros-tuckshop" */
function slugify(name: string): string {
    return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
}

/**
 * Sign-up → signed in on the new workspace → "Get selling" checklist.
 * Collects just enough to make the first sale possible: what the business
 * is (so the till opens in the right mode) and the owner's till PIN (so they
 * can sign into the till immediately — owners used to have no PIN at all).
 */
export default function Register() {
    usePageTitle("Start your free trial");

    const [form, setForm] = useState({
        businessName: "", ownerName: "", subdomain: "", businessType: "retail",
        email: "", password: "", password_confirmation: "", pin: "",
    });
    // Suggest the workspace from the business name until the owner edits it themselves.
    const [subdomainEdited, setSubdomainEdited] = useState(false);
    const [availability, setAvailability] = useState<Availability>("idle");
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

    function setBusinessName(v: string) {
        setForm((f) => ({ ...f, businessName: v, subdomain: subdomainEdited ? f.subdomain : slugify(v) }));
    }

    // Live availability check, debounced so it doesn't fire on every keystroke.
    useEffect(() => {
        const sub = form.subdomain;
        if (!sub) { setAvailability("idle"); return; }
        if (sub.length < 3 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(sub)) { setAvailability("invalid"); return; }
        setAvailability("checking");
        // Lookups can take seconds on the hosted DB; if the name changes
        // meanwhile, an older answer arriving last must not overwrite the
        // newer one (it would show "taken" for a free name, or vice versa).
        let stale = false;
        const timer = setTimeout(async () => {
            try {
                const r = await fetch(`${API_BASE}/tenant-lookup?subdomain=${encodeURIComponent(sub)}`);
                const body = (await r.json()) as { exists: boolean; reserved?: boolean };
                if (!stale) setAvailability(body.reserved ? "reserved" : body.exists ? "taken" : "available");
            } catch {
                if (!stale) setAvailability("idle"); // can't check — the server re-checks on submit anyway
            }
        }, 400);
        return () => { stale = true; clearTimeout(timer); };
    }, [form.subdomain]);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setErrors({});
        const local: Record<string, string> = {};
        if (form.password !== form.password_confirmation) local.password_confirmation = "Passwords don't match.";
        if (!/^\d{4}$/.test(form.pin)) local.pin = "Your till PIN is 4 digits.";
        if (availability === "taken" || availability === "reserved") local.subdomain = "Choose another workspace name.";
        if (Object.keys(local).length) { setErrors(local); return; }

        setLoading(true);
        try {
            const body = await fetch(`${API_BASE}/register`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    businessName: form.businessName, ownerName: form.ownerName, subdomain: form.subdomain,
                    businessType: form.businessType, email: form.email, password: form.password, pin: form.pin,
                }),
            }).then(async (r) => {
                const json = await r.json();
                if (!r.ok) throw new ApiError(r.status, json.message ?? "Registration failed.", json);
                return json as { subdomain: string; handoff: string };
            });
            // Straight into the new workspace, signed in (pages/Auth/Welcome.tsx).
            // Fragment, not query string: never sent to a server or logged.
            window.location.href = `${workspaceOrigin(body.subdomain)}/welcome#t=${encodeURIComponent(body.handoff)}`;
        } catch (err) {
            if (err instanceof ApiError) {
                const b = err.body as Record<string, unknown>;
                setErrors((b.errors as Record<string, string>) ?? { general: err.message });
            } else {
                setErrors({ general: "Couldn't reach the server. Check your connection." });
            }
            setLoading(false);
        }
    }

    const availabilityNote: Record<Availability, { text: string; cls: string } | null> = {
        idle: null,
        checking: { text: "Checking…", cls: "text-muted" },
        available: { text: "✓ Available", cls: "text-emerald-600" },
        taken: { text: "Already taken — try another", cls: "text-red-500" },
        reserved: { text: "That name is reserved — try another", cls: "text-red-500" },
        invalid: { text: "3–30 letters, numbers or dashes", cls: "text-amber-600" },
    };
    const note = availabilityNote[availability];

    return (
        <div className="grid min-h-screen place-items-center bg-canvas p-4 sm:p-6 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,transparent_65%)]" />

            <div className="relative z-10 w-full max-w-md anim-pop-in my-8">
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-2xl shadow-[0_0_30px_rgba(124,58,237,0.4)] ring-1 ring-white/10">🛒</div>
                    <h1 className="text-2xl font-bold tracking-tight text-ink">Start selling in minutes</h1>
                    <p className="mt-1.5 text-sm text-muted">{TRIAL_DAYS}-day free trial · No card required</p>
                </div>

                <div className="rounded-2xl border border-hairline bg-surface/90 p-6 sm:p-8 shadow-xl backdrop-blur-md">
                    <form onSubmit={submit} className="space-y-4">
                        {errors.general && (
                            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-red-500/20">{errors.general}</p>
                        )}

                        <Field label="Business name" value={form.businessName} onChange={setBusinessName} error={errors.businessName} placeholder="Mai Tariro's Tuckshop" autoFocus />

                        <div>
                            <label htmlFor="workspace" className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">Workspace address</label>
                            <div className="flex items-center rounded-xl border border-hairline bg-canvas/60 pr-3 focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/20">
                                <input
                                    id="workspace"
                                    value={form.subdomain}
                                    onChange={(e) => { setSubdomainEdited(true); set("subdomain")(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30)); }}
                                    placeholder="tariros-tuckshop"
                                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-ink outline-none"
                                    aria-invalid={Boolean(errors.subdomain)}
                                />
                                <span className="shrink-0 text-sm text-muted">.{TENANT_DOMAIN}</span>
                            </div>
                            {errors.subdomain
                                ? <FieldError text={errors.subdomain} />
                                : note && <p className={`mt-1 text-xs ${note.cls}`}>{note.text}</p>}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">What kind of business?</label>
                            <div className="grid grid-cols-2 gap-2">
                                {TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => set("businessType")(t.value)}
                                        className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                                            form.businessType === t.value
                                                ? "border-violet-500/60 bg-violet-500/10 ring-2 ring-violet-500/20"
                                                : "border-hairline hover:bg-canvas"
                                        }`}
                                    >
                                        <span className="text-lg">{t.icon}</span>
                                        <span className="ml-1.5 text-sm font-semibold text-ink">{t.label}</span>
                                        <span className="block text-xs text-muted">{t.hint}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 text-xs text-muted">Sets up your till for this. You can change it later per branch.</p>
                        </div>

                        <Field label="Your name" value={form.ownerName} onChange={set("ownerName")} error={errors.ownerName} placeholder="Tariro Moyo" />
                        <Field label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email} placeholder="tariro@example.com" />
                        <Field label="Password" type="password" value={form.password} onChange={set("password")} error={errors.password} placeholder="At least 8 characters" />
                        <Field label="Confirm password" type="password" value={form.password_confirmation} onChange={set("password_confirmation")} error={errors.password_confirmation} placeholder="••••••••" />

                        <div>
                            <Field
                                label="Till PIN"
                                type="password"
                                inputMode="numeric"
                                value={form.pin}
                                onChange={(v) => set("pin")(v.replace(/\D/g, "").slice(0, 4))}
                                error={errors.pin}
                                placeholder="4 digits"
                            />
                            {!errors.pin && <p className="mt-1 text-xs text-muted">You'll use this to sign in at the till.</p>}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 font-bold text-white text-sm tracking-wide shadow-lg shadow-indigo-500/25 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
                        >
                            {loading ? "Creating your store…" : "Start free trial"}
                        </button>
                    </form>
                </div>

                <div className="mt-6 text-center text-xs text-muted">
                    Already have a store?{" "}
                    <Link to="/login" className="font-semibold text-violet-500 hover:underline">Sign in</Link>
                </div>
            </div>
        </div>
    );
}

function FieldError({ text }: { text: string }) {
    return <p className="mt-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-red-500/20">{text}</p>;
}

function Field({ label, value, onChange, error, type = "text", placeholder = "", autoFocus = false, inputMode }: {
    label: string; value: string; onChange: (v: string) => void;
    error?: string; type?: string; placeholder?: string; autoFocus?: boolean;
    inputMode?: "numeric" | "text" | "email";
}) {
    const id = useId(); // ties the label to its input (screen readers, click-to-focus)
    return (
        <div>
            <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">{label}</label>
            <input id={id} type={type} value={value} autoFocus={autoFocus} placeholder={placeholder} inputMode={inputMode}
                   onChange={(e) => onChange(e.target.value)}
                   className="w-full rounded-xl border border-hairline bg-canvas/60 px-4 py-3 text-sm text-ink outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                   aria-invalid={Boolean(error)}
            />
            {error && <FieldError text={error} />}
        </div>
    );
}
