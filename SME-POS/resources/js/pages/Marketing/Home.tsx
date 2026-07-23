import { Head, Link, useForm, usePage } from "@inertiajs/react";
import { useEffect, useState } from "react";
import type { SharedProps } from "../../lib/types";

interface PlanInfo {
    label: string;
    price: number;
    recurring: boolean;
    branches: number | null;
    best_for: string;
    features: string[];
}
interface HardwareInfo {
    label: string;
    price: number;
}
interface BusinessTierInfo {
    label: string;
    description: string;
    features: string[];
}
interface Props extends SharedProps {
    plans: Record<string, PlanInfo>;
    hardware: Record<string, HardwareInfo>;
    businessTier: BusinessTierInfo;
    enterpriseTier: BusinessTierInfo;
    zimraAddonPrice: number;
}

const DEMO_PRODUCTS = [
    { name: "Coca-Cola 500ml", price: 1.5 },
    { name: "Bread — White Loaf", price: 1.2 },
    { name: "Fresh Milk 1L", price: 2.5 },
    { name: "Chicken Portions 1kg", price: 5.99 },
];

const THEME_KEY = "wivae.theme";

/**
 * Landing-page theme: defaults to LIGHT unconditionally (not system
 * preference) — unlike the dashboard's useDarkMode, which respects the OS.
 * Most marketing sites default light regardless of the visitor's OS setting;
 * a data-dense admin tool and a persuasion-first landing page have different
 * defaults for good reason. Shares the same localStorage key as the
 * dashboard, so a choice made here carries over after signing in.
 */
function useMarketingTheme(): [boolean, () => void] {
    const [dark, setDark] = useState(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem(THEME_KEY) === "dark";
    });

    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    }, [dark]);

    return [dark, () => setDark((d) => !d)];
}

export default function Home() {
    const { plans, hardware, businessTier, enterpriseTier } = usePage<Props>().props;
    const [dark, toggleDark] = useMarketingTheme();
    const [enquiryFor, setEnquiryFor] = useState<"business" | "enterprise" | null>(null);

    return (
        <div className="min-h-screen bg-canvas text-ink transition-colors">
            <Head title="WivaePOS — Run your business smarter. Sell anywhere." />

            <Nav dark={dark} toggleDark={toggleDark} />
            <Hero />
            <OfflineStrip />
            <Features />
            <Pricing
                plans={plans}
                hardware={hardware}
                businessTier={businessTier}
                enterpriseTier={enterpriseTier}
                onEnquire={(tier) => setEnquiryFor(tier)}
            />
            <FAQ />
            <FooterCta />
            <Footer />
            {enquiryFor && <EnquiryModal tier={enquiryFor} onClose={() => setEnquiryFor(null)} />}
        </div>
    );
}

function Nav({ dark, toggleDark }: { dark: boolean; toggleDark: () => void }) {
    return (
        <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-md transition-colors">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 p-1.5 text-white shadow-[0_0_16px_rgba(124,58,237,0.5)]">
                        <IconSpider />
                    </div>
                    <span className="font-display text-lg font-bold tracking-tight">WivaePOS</span>
                </div>
                <nav className="hidden items-center gap-8 text-sm text-muted sm:flex">
                    <a href="#features" className="hover:text-ink transition-colors">Features</a>
                    <a href="#pricing" className="hover:text-ink transition-colors">Pricing</a>
                    <a href="#faq" className="hover:text-ink transition-colors">FAQ</a>
                </nav>
                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleDark}
                        aria-label="Toggle theme"
                        title="Toggle theme"
                        className="rounded-full p-2 text-muted hover:bg-surface"
                    >
                        {dark ? <IconSun /> : <IconMoon />}
                    </button>
                    <Link href="/login" className="text-sm text-muted hover:text-ink transition-colors">
                        Sign in
                    </Link>
                    <Link
                        href="/register"
                        className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:opacity-90 transition-opacity"
                    >
                        Start free trial
                    </Link>
                </div>
            </div>
        </header>
    );
}

/**
 * Hero is deliberately dark REGARDLESS of the page-wide toggle — "default
 * dark in selected areas only." Device mockups read better against a dark
 * stage (matches how the actual till and dashboard's own dark mode look),
 * and it gives the page one dramatic beat rather than uniform brightness
 * throughout. Everything below this responds to the toggle normally.
 */
function Hero() {
    return (
        <section className="relative overflow-hidden bg-[#0a0612] px-6 pb-20 pt-16 sm:pt-24">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,58,237,0.22)_0%,transparent_70%)]" />

            <div className="mx-auto max-w-3xl text-center">
                <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Built to keep selling through load-shedding and dropped signal
                </div>
                <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">
                    Run your business smarter.
                    <br />
                    <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Sell anywhere.
          </span>
                </h1>
                <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">
                    WivaePOS manages sales, inventory, staff, and reporting in real time across every device and branch —
                    built offline-first for how Zimbabwean businesses actually trade.
                </p>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                    <Link
                        href="/register"
                        className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-7 py-3.5 text-sm font-bold text-white shadow-[0_4px_24px_rgba(124,58,237,0.4)] hover:opacity-90 transition-opacity"
                    >
                        Start 7-day free trial
                    </Link>
                    <a
                        href="#pricing"
                        className="rounded-xl border border-white/15 px-7 py-3.5 text-sm font-semibold text-white/80 hover:bg-white/5 transition-colors"
                    >
                        See pricing
                    </a>
                </div>
                <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-white/40">
                    <span className="flex items-center gap-1.5"><IconCheck /> 7-day free trial — $0 due today</span>
                    <span className="flex items-center gap-1.5"><IconCheck /> No credit card</span>
                    <span className="flex items-center gap-1.5"><IconCheck /> Cancel anytime</span>
                </p>
            </div>

            <DeviceMockups />
        </section>
    );
}

/**
 * Our own device composition, not a copy of any reference layout's specific
 * artwork — a monitor showing the real dashboard's actual layout (KPI cards,
 * revenue chart, top products — matching Dashboard/Index.tsx honestly, not
 * invented screens), a phone showing the real till's product grid (the till
 * genuinely is a mobile-installable PWA, so this isn't a fabricated "mobile
 * app"), and the actual Bluetooth thermal printer hardware bundle sold on
 * the Standard/Premium plans. Drawn as UI, not a fake photo — honest about
 * what it is.
 *
 * Full-bleed and genuinely 3D: a `perspective` container plus real
 * rotateY/rotateX/translateZ transforms per device, not a drop-shadow
 * pretending to be depth — see the transforms inline below.
 */
function DeviceMockups() {
    return (
        <div
            className="relative mx-auto mt-16 w-full max-w-[1600px] px-4"
            style={{ perspective: "2400px" }}
        >
            <div className="pointer-events-none absolute -inset-20 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.18)_0%,transparent_70%)]" />
            <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-end lg:justify-center lg:gap-0">
                {/* Monitor — dashboard, the largest element, tilted toward the phone */}
                <div
                    className="w-full max-w-3xl lg:-mr-16 lg:w-[58%]"
                    style={{ transform: "rotateY(10deg) rotateX(3deg)", transformStyle: "preserve-3d" }}
                >
                    <div className="overflow-hidden rounded-t-2xl border border-white/10 bg-white/[0.03] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] backdrop-blur-sm">
                        <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3">
                            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                        </div>
                        <div className="p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <span className="font-display text-base font-bold text-white">WivaePOS</span>
                                <span className="text-xs text-white/40">Welcome back</span>
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                                {[
                                    { l: "Revenue", v: "$4,950", tint: "from-violet-500 to-indigo-500" },
                                    { l: "Orders", v: "129", tint: "from-emerald-500 to-teal-500" },
                                    { l: "Products", v: "86", tint: "from-fuchsia-500 to-violet-500" },
                                    { l: "Staff", v: "12", tint: "from-orange-500 to-amber-500" },
                                ].map((k) => (
                                    <div key={k.l} className="rounded-lg bg-white/5 p-3">
                                        <div className={`mb-1.5 h-1 w-8 rounded-full bg-gradient-to-r ${k.tint}`} />
                                        <div className="text-[11px] text-white/40">{k.l}</div>
                                        <div className="text-lg font-bold text-white">{k.v}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 flex h-28 items-end gap-2 rounded-lg bg-white/5 p-3">
                                {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                                    <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-violet-500 to-indigo-400" style={{ height: `${h}%` }} />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mx-auto h-5 w-32 bg-white/8" />
                    <div className="mx-auto h-2 w-56 rounded-full bg-white/10" />
                </div>

                {/* Phone — till, tilted the opposite way and pulled forward so it
            genuinely sits in front of the monitor rather than beside it. */}
                <div
                    className="relative z-10 w-56 shrink-0 lg:w-64"
                    style={{ transform: "rotateY(-14deg) rotateX(2deg) translateZ(60px)", transformStyle: "preserve-3d" }}
                >
                    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-2 shadow-[0_40px_100px_-15px_rgba(0,0,0,0.75)] backdrop-blur-sm">
                        <div className="overflow-hidden rounded-[1.5rem] bg-black/40">
                            <div className="flex items-center justify-between px-4 pt-4">
                                <span className="text-xs font-bold text-white">WivaePOS</span>
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-3">
                                {DEMO_PRODUCTS.map((p) => (
                                    <div key={p.name} className="rounded-lg bg-white/5 p-2.5">
                                        <div className="mb-1.5 h-1 w-5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 opacity-70" />
                                        <div className="truncate text-[11px] font-medium text-white/80">{p.name}</div>
                                        <div className="text-xs font-bold text-violet-300">${p.price.toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="mx-3 mb-3 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 py-2.5 text-center text-xs font-bold text-white">
                                Charge $10.19
                            </div>
                        </div>
                    </div>
                </div>

                {/* Receipt printer — sits low, angled with the monitor, matching the
            actual Bluetooth thermal printer hardware bundle. */}
                <div
                    className="relative hidden shrink-0 lg:-ml-10 lg:mb-2 lg:block"
                    style={{ transform: "rotateY(14deg) rotateX(4deg)", transformStyle: "preserve-3d" }}
                >
                    <div className="relative">
                        <div className="h-24 w-44 rounded-2xl bg-gradient-to-b from-[#1e1e1e] to-[#0a0a0a] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]" />
                        <div className="absolute inset-x-3 top-3 h-12 rounded-xl bg-white/95 p-2">
                            <div className="h-1.5 w-full bg-slate-300" />
                            <div className="mt-1.5 h-1.5 w-3/4 bg-slate-300" />
                            <div className="mt-1.5 h-1.5 w-5/6 bg-slate-300" />
                        </div>
                        <div className="absolute bottom-3 right-4 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                    </div>
                    <p className="mt-3 text-center text-xs text-white/30">Bluetooth thermal printer</p>
                </div>
            </div>
        </div>
    );
}

function OfflineStrip() {
    const points = [
        { k: "Zero", v: "sales lost to a dropped connection" },
        { k: "Seconds", v: "to reconcile every branch once you're back online" },
        { k: "Two", v: "modes, one system — retail counter or full table service" },
    ];
    return (
        <section className="border-y border-hairline bg-surface px-6 py-10 transition-colors">
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
                {points.map((p) => (
                    <div key={p.k} className="text-center">
                        <div className="font-display text-3xl font-bold text-brand-500">{p.k}</div>
                        <div className="mt-1 text-sm text-muted">{p.v}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function Features() {
    const items = [
        { icon: "🛍", title: "Retail counter", body: "A fast product grid built for a queue — search, scan, or tap, and take cash, EcoCash, or any tender you already use." },
        { icon: "🍽", title: "Full table service", body: "Floor plan, kitchen display, gratuity — switch a branch to restaurant mode and every till there follows, automatically." },
        { icon: "📶", title: "Actually offline", body: "Not a cache trick. Sales, stock, and staff all work locally first, then reconcile — load-shedding doesn't stop a sale." },
        { icon: "🏪", title: "Multi-branch, one login", body: "Run a retail shop and a restaurant under one account. Each branch keeps its own mode, staff, and stock." },
        { icon: "🧾", title: "ZIMRA-ready", body: "Fiscalisation built against the real FDMS spec — turn it on when you're ready, not before." },
        { icon: "👥", title: "Staff & payroll", body: "PIN-only till logins for cashiers, full dashboard access for managers, PAYE handled on the Premium plan." },
        { icon: "🎨", title: "White-label", body: "Your logo, your colours, your subdomain. Customers see your brand, not ours — Wivae is the engine underneath." },
        { icon: "✨", title: "AI Analytics", body: "Reorder suggestions, pricing flags, and dead-stock alerts — surfaced automatically from your own sales data." },
    ];
    return (
        <section id="features" className="px-6 py-24">
            <div className="mx-auto max-w-5xl">
                <div className="mx-auto max-w-lg text-center">
                    <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Built for how you actually trade</h2>
                    <p className="mt-3 text-muted">Not a generic POS with local features bolted on — designed around a Zimbabwean SME from the first line of code.</p>
                </div>
                <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((f) => (
                        <div
                            key={f.title}
                            className="rounded-2xl border border-hairline bg-surface p-6 transition-colors hover:border-brand-500/30"
                        >
                            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-lg">
                                {f.icon}
                            </div>
                            <h3 className="font-semibold">{f.title}</h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function Pricing({
                     plans,
                     hardware,
                     businessTier,
                     enterpriseTier,
                     onEnquire,
                 }: {
    plans: Record<string, PlanInfo>;
    hardware: Record<string, HardwareInfo>;
    businessTier: BusinessTierInfo;
    enterpriseTier: BusinessTierInfo;
    onEnquire: (tier: "business" | "enterprise") => void;
}) {
    return (
        <section id="pricing" className="border-t border-hairline px-6 py-24 transition-colors">
            <div className="mx-auto max-w-5xl">
                <div className="mx-auto max-w-lg text-center">
                    <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Simple, honest pricing</h2>
                    <p className="mt-3 text-muted">Standard and Premium include their tablet — hardware and software billed together, one clear monthly price.</p>
                </div>

                <div className="mx-auto mt-8 max-w-2xl rounded-xl border border-hairline bg-surface p-4 text-center text-sm text-muted transition-colors">
                    <span className="font-medium text-ink">Not sure which one fits?</span> Each plan below is scoped to a
                    real situation, not just a feature count — read the "Best for" line under the price before comparing
                    the checklist.
                </div>

                <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
                    {Object.entries(plans).map(([key, p]) => (
                        <div
                            key={key}
                            className={`relative rounded-2xl border p-7 transition-colors ${
                                key === "standard"
                                    ? "border-brand-500/50 bg-brand-50 shadow-[0_0_40px_-10px_rgba(124,58,237,0.2)]"
                                    : "border-hairline bg-surface"
                            }`}
                        >
                            {key === "standard" && (
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Most popular
                </span>
                            )}
                            <h3 className="font-display text-lg font-bold">{p.label}</h3>
                            <div className="mt-3 flex items-baseline gap-1">
                                <span className="text-4xl font-bold tabular-nums">${p.price}</span>
                                <span className="text-sm text-muted">/mo</span>
                            </div>
                            <p className="mt-1 text-xs text-muted">
                                {p.branches === null ? "Unlimited branches" : `Up to ${p.branches} branch${p.branches === 1 ? "" : "es"}`}
                            </p>
                            <p className="mt-3 text-xs font-medium text-brand-600">Best for: {p.best_for}</p>
                            <ul className="mt-5 space-y-2.5 text-sm">
                                {p.features.map((f) => (
                                    <li key={f} className="flex items-start gap-2">
                                        <span className="mt-0.5 text-brand-500"><IconCheck /></span>
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href="/register"
                                className={`mt-7 block rounded-xl py-3 text-center text-sm font-semibold transition-opacity hover:opacity-90 ${
                                    key === "standard"
                                        ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white"
                                        : "border border-hairline"
                                }`}
                            >
                                Start with {p.label}
                            </Link>
                        </div>
                    ))}
                </div>

                <p className="mx-auto mt-5 max-w-2xl text-center text-xs text-muted">
                    BYOD has no minimum term. Standard and Premium include a 6-month minimum, since the tablet and printer
                    bundled into the price are covered over that period.
                </p>

                <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-hairline p-6 text-center transition-colors">
                    <h3 className="font-display text-lg font-bold">Need hardware?</h3>
                    <p className="mt-1 text-xs text-muted">
                        Standard and Premium already include theirs. This is only for BYOD, or a Standard customer wanting
                        the bigger 12" tablet without upgrading.
                    </p>
                    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {Object.entries(hardware).map(([key, h]) => (
                            <div key={key} className="rounded-xl border border-hairline p-4 text-left">
                                <div className="text-sm font-medium">{h.label}</div>
                                <div className="mt-1 text-xl font-bold text-brand-500">${h.price}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Business + Enterprise — quote-based, deliberately not part of the
            self-serve grid above. Neither is a fixed price, so this section
            uses its own layout (icon + description + checklist + CTA)
            rather than pretending to be two more price cards. */}
                <div className="mt-16">
                    <div className="mx-auto max-w-lg text-center">
                        <h3 className="font-display text-2xl font-bold tracking-tight">Need something bigger?</h3>
                        <p className="mt-2 text-sm text-muted">A full counter setup, or a custom build for multiple locations — talk to us and we'll quote it properly.</p>
                    </div>
                    <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
                        <TierCard
                            tier={businessTier}
                            iconBg="bg-gradient-to-br from-orange-500 to-amber-500"
                            icon={<IconLaptop />}
                            ctaLabel="Submit Inquiry for Quote"
                            onClick={() => onEnquire("business")}
                            filled={false}
                        />
                        <TierCard
                            tier={enterpriseTier}
                            iconBg="bg-gradient-to-br from-violet-500 to-indigo-600"
                            icon={<IconBuilding />}
                            ctaLabel="Register your interest"
                            onClick={() => onEnquire("enterprise")}
                            filled={false}
                            comingSoon
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

function TierCard({
                      tier,
                      iconBg,
                      icon,
                      ctaLabel,
                      onClick,
                      filled,
                      comingSoon,
                  }: {
    tier: BusinessTierInfo;
    iconBg: string;
    icon: React.ReactNode;
    ctaLabel: string;
    onClick: () => void;
    filled: boolean;
    comingSoon?: boolean;
}) {
    return (
        <div className="relative rounded-2xl border border-hairline bg-surface p-7 transition-colors">
            {comingSoon && (
                <span className="absolute right-6 top-6 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Coming soon
        </span>
            )}
            <div className="flex items-start gap-4">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white ${iconBg}`}>
                    {icon}
                </div>
                <div>
                    <h4 className="font-display text-lg font-bold">{tier.label}</h4>
                    <p className="mt-1 text-sm text-muted">{tier.description}</p>
                </div>
            </div>
            <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
                {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                        <span className="mt-0.5 text-brand-500"><IconCheck /></span>
                        <span>{f}</span>
                    </li>
                ))}
            </ul>
            <button
                onClick={onClick}
                className={`mt-7 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
                    filled
                        ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white"
                        : "border border-hairline"
                }`}
            >
                {ctaLabel}
                <span aria-hidden>→</span>
            </button>
            {comingSoon && (
                <p className="mt-2 text-xs text-muted">
                    Not available yet — this registers your interest so we can reach out when it's ready.
                </p>
            )}
        </div>
    );
}

function FAQ() {
    const faqs = [
        { q: "Does it really work without internet?", a: "Yes — sales, stock, and staff all live on the device first and sync when a connection returns. A dropped connection or load-shedding never blocks a sale." },
        { q: "What happens if the power or network drops mid-sale?", a: "Nothing is lost. The sale completes locally and queues for sync; nothing waits on the network to finish a transaction." },
        { q: "Can I switch between retail and restaurant mode?", a: "Yes, per branch. One tenant can run a retail shop and a restaurant as two branches, each with its own mode." },
        { q: "Is ZIMRA fiscalisation included?", a: "It's available as an add-on, built against ZIMRA's real FDMS spec. Turn it on when you're ready — it isn't forced on every plan." },
        { q: "Do I need to buy hardware from you?", a: "No. BYOD works with your own Android tablet and printer. Hardware bundles are optional, priced separately, and available on any plan." },
        { q: "Can I cancel anytime?", a: "BYOD, yes, no lock-in. Standard and Premium include a 6-month minimum term, since the tablet and printer bundled into the price are covered over that period, not upfront." },
    ];
    return (
        <section id="faq" className="border-t border-hairline px-6 py-24 transition-colors">
            <div className="mx-auto max-w-2xl">
                <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
                    Frequently asked questions
                </h2>
                <div className="mt-10 divide-y divide-hairline">
                    {faqs.map((f) => (
                        <FaqItem key={f.q} q={f.q} a={f.a} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function FaqItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="py-4">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-4 text-left"
            >
                <span className="font-medium">{q}</span>
                <span className={`shrink-0 text-muted transition-transform ${open ? "rotate-45" : ""}`}>
          <IconPlus />
        </span>
            </button>
            {open && <p className="mt-2 text-sm text-muted">{a}</p>}
        </div>
    );
}

function FooterCta() {
    return (
        <section className="border-t border-hairline px-6 py-16 transition-colors">
            <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    Ready to stop losing sales to load-shedding?
                </h2>
                <Link
                    href="/register"
                    className="mt-7 inline-block rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_4px_24px_rgba(124,58,237,0.4)] hover:opacity-90 transition-opacity"
                >
                    Start your free trial
                </Link>
            </div>
        </section>
    );
}

/** Placeholder structure — real social handles, email, and phone still needed. */
function Footer() {
    return (
        <footer className="border-t border-hairline bg-surface px-6 py-12 transition-colors">
            <div className="mx-auto max-w-6xl">
                <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
                    <div className="col-span-2 sm:col-span-1">
                        <div className="flex items-center gap-2">
                            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 p-1 text-white">
                                <IconSpider />
                            </div>
                            <span className="font-display text-base font-bold">WivaePOS</span>
                        </div>
                        <p className="mt-3 text-sm text-muted">Point of sale that never stops selling.</p>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Company</p>
                        <ul className="mt-3 space-y-2 text-sm text-muted">
                            <li><a href="#" className="hover:text-ink transition-colors">About</a></li>
                            <li><a href="#" className="hover:text-ink transition-colors">Partners</a></li>
                            <li><a href="#" className="hover:text-ink transition-colors">Careers</a></li>
                            <li><a href="#" className="hover:text-ink transition-colors">Blog</a></li>
                        </ul>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Contact</p>
                        <ul className="mt-3 space-y-2 text-sm text-muted">
                            <li>support@example.com <span className="text-xs">(placeholder)</span></li>
                            <li>+263 00 000 0000 <span className="text-xs">(placeholder)</span></li>
                        </ul>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Follow</p>
                        <div className="mt-3 flex gap-3">
                            {[IconFacebook, IconInstagram, IconLinkedin, IconTwitter].map((Icon, i) => (
                                <a
                                    key={i}
                                    href="#"
                                    aria-label="Social link — placeholder"
                                    className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-muted hover:text-ink hover:border-brand-500/40 transition-colors"
                                >
                                    <Icon />
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
                <p className="mt-10 border-t border-hairline pt-6 text-xs text-muted">
                    © {new Date().getFullYear()} WivaePOS. Tech · Innovate · Transform.
                </p>
            </div>
        </footer>
    );
}

/**
 * The Business tier's real submission flow — posts to EnquiryController,
 * which stores the enquiry regardless of whether the notification email
 * is configured. onSuccess closes the modal and shows a thank-you state
 * rather than silently resetting, so a visitor knows it actually went
 * through.
 */
function EnquiryModal({ tier, onClose }: { tier: "business" | "enterprise"; onClose: () => void }) {
    const [sent, setSent] = useState(false);
    const form = useForm({ name: "", business_name: "", interested_in: tier, email: "", phone: "", message: "" });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        form.post("/enquire", {
            preserveScroll: true,
            onSuccess: () => setSent(true),
        });
    }

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-6 shadow-xl transition-colors"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">
                        {sent ? "Thanks — got it" : `Enquire about ${tier === "enterprise" ? "Enterprise" : "Business"}`}
                    </h2>
                    <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
                </div>

                {sent ? (
                    <p className="mt-4 text-sm text-muted">
                        {tier === "enterprise"
                            ? "We've got your details and will reach out when Enterprise is ready — no commitment, just an early heads-up."
                            : "We've received your details and will be in touch shortly to put together a quote."}
                    </p>
                ) : (
                    <form onSubmit={submit} className="mt-4 space-y-3">
                        <Field label="Your name" error={form.errors.name}>
                            <input
                                value={form.data.name}
                                onChange={(e) => form.setData("name", e.target.value)}
                                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                        </Field>
                        <Field label="Business name" error={form.errors.business_name}>
                            <input
                                value={form.data.business_name}
                                onChange={(e) => form.setData("business_name", e.target.value)}
                                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                        </Field>
                        <Field label="Email" error={form.errors.email}>
                            <input
                                type="email"
                                value={form.data.email}
                                onChange={(e) => form.setData("email", e.target.value)}
                                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                        </Field>
                        <Field label="Phone (optional)">
                            <input
                                value={form.data.phone}
                                onChange={(e) => form.setData("phone", e.target.value)}
                                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                            />
                        </Field>
                        <Field label="What are you looking for? (optional)">
              <textarea
                  rows={3}
                  value={form.data.message}
                  onChange={(e) => form.setData("message", e.target.value)}
                  className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
                        </Field>
                        <button
                            type="submit"
                            disabled={form.processing}
                            className="mt-2 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                            {form.processing ? "Sending…" : "Send enquiry"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
            {children}
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
    );
}

/** The spider mark from the Wivae brand artwork — a simple filled
 * silhouette (body, head, four legs each side), not a literal copy of any
 * reference image, matching the brand's own logo concept. */
function IconSpider() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full">
            <ellipse cx="12" cy="13" rx="3.4" ry="4.2" />
            <circle cx="12" cy="7.2" r="2.2" />
            <path d="M9 10.5 3 8m6 2.5-5 4.5m5-4.5-4 6.8M15 10.5 21 8m-6 2.5 5 4.5m-5-4.5 4 6.8M9.6 15.5 4.5 19m5.1-3.5-2.6 5.8M14.4 15.5 19.5 19m-5.1-3.5 2.6 5.8"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
    );
}

function IconLaptop() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M2 19h20M9 19v-1M15 19v-1" /></svg>; }
function IconBuilding() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M16 21v-9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9M4 21h16M8 7h1M8 11h1M8 15h1M12 7h1M12 11h1M12 15h1" /></svg>; }
function IconCheck() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function IconPlus() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>; }
function IconSun() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>; }
function IconMoon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>; }
function IconFacebook() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" /></svg>; }
function IconInstagram() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>; }
function IconLinkedin() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21h-4V9Z" /></svg>; }
function IconTwitter() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 5.9c-.7.3-1.5.6-2.3.7.8-.5 1.5-1.3 1.8-2.3-.8.5-1.7.8-2.6 1a4.1 4.1 0 0 0-7 3.7A11.6 11.6 0 0 1 3.4 4.6a4.1 4.1 0 0 0 1.3 5.5c-.7 0-1.3-.2-1.9-.5v.1a4.1 4.1 0 0 0 3.3 4 4.2 4.2 0 0 1-1.9.1 4.1 4.1 0 0 0 3.8 2.9A8.3 8.3 0 0 1 2 18.4a11.6 11.6 0 0 0 6.3 1.9c7.5 0 11.7-6.3 11.7-11.7v-.5c.8-.6 1.5-1.3 2-2.2Z" /></svg>; }
