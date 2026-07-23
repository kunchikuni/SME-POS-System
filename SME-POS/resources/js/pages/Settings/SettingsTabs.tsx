import { Link } from "@inertiajs/react";

/** Tab strip shared by Settings/General and Settings/Branding. */
export function SettingsTabs({ active }: { active: "general" | "branding" | "account" | "fiscalisation" }) {
    const tabs = [
        { key: "general", label: "General", href: "/settings/general" },
        { key: "branding", label: "Appearance", href: "/settings/branding" },
        { key: "fiscalisation", label: "Fiscalisation", href: "/settings/fiscalisation" },
        { key: "account", label: "Account", href: "/settings/account" },
    ] as const;

    return (
        <div className="mt-4 flex gap-1 border-b border-hairline">
            {tabs.map((t) => (
                <Link
                    key={t.key}
                    href={t.href}
                    className={`border-b-2 px-4 py-2.5 text-sm font-medium ${
                        active === t.key
                            ? "border-brand-600 text-ink"
                            : "border-transparent text-muted hover:text-ink"
                    }`}
                >
                    {t.label}
                </Link>
            ))}
        </div>
    );
}
