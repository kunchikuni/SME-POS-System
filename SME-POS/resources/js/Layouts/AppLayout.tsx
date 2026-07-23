import { Link, router, usePage } from "@inertiajs/react";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import type { SharedProps } from "../lib/types";
import { useDarkMode } from "../lib/useDarkMode";
import { useOnlineStatus } from "../lib/useOnlineStatus";

/**
 * Dashboard shell for signed-in staff — a left sidebar + top bar, matching the
 * reference product design. Nav items that don't have a page yet (Orders,
 * Reports beyond Analytics, Tasks, HR & Payroll, …) are shown but disabled with
 * a "Soon" tag rather than linking to a 404 or pretending to be real.
 */

interface NavItem {
  label: string;
  href?: string;
  icon: ReactNode;
  match?: (url: string) => boolean;
  soon?: boolean;
  badge?: string;
}

export default function AppLayout({ children }: PropsWithChildren) {
  const page = usePage<SharedProps>();
  const { tenant, auth } = page.props;
  const url = page.url;
  const theme = tenant?.theme;
  const primary = theme?.primary;
  const logoUrl = theme?.logo_url;
  const isAdmin = auth.user?.role === "owner" || auth.user?.role === "manager";
  const [dark, toggleDark] = useDarkMode();
  const online = useOnlineStatus();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const openTaskCount = tenant?.openTaskCount ?? 0;

  const nav: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: <IconGrid />, match: (u) => u === "/" || u.startsWith("/dashboard") },
    { label: "POS", href: "/pos", icon: <IconCart /> },
    { label: "Inventory", href: "/products", icon: <IconBox />, match: (u) => u.startsWith("/products") || u.startsWith("/categories") },
    { label: "Orders", href: "/orders", icon: <IconClipboard />, match: (u) => u.startsWith("/orders") },
    { label: "Transactions", href: "/transactions", icon: <IconReceipt />, match: (u) => u.startsWith("/transactions") },
    { label: "Reports", href: "/analytics", icon: <IconChart />, match: (u) => u.startsWith("/analytics") },
    { label: "AI Insights", href: "/ai-insights", icon: <IconSparkle />, match: (u) => u.startsWith("/ai-insights") },
    { label: "Staff Management", href: "/staff", icon: <IconUsers />, match: (u) => u.startsWith("/staff") },
    { label: "Tasks", href: "/tasks", icon: <IconTasks />, badge: openTaskCount > 0 ? String(openTaskCount) : undefined, match: (u) => u.startsWith("/tasks") },
    { label: "Branches", href: "/branches", icon: <IconStore />, match: (u) => u.startsWith("/branches") },
    // Not gated by mode: mode is per-branch now (see Branches page), and any
    // branch — retail-default or not — can have sales that explicitly routed
    // to the kitchen. A tenant with none just sees an empty Kitchen Display.
    { label: "Kitchen", href: "/kitchen", icon: <IconChef />, match: (u) => u.startsWith("/kitchen") },
    { label: "Fiscalisation", href: "/settings/fiscalisation", icon: <IconChip />, badge: "ADD-ON", match: (u) => u.startsWith("/settings/fiscalisation") },
    { label: "Payments", href: "/settings/payments", icon: <IconCard />, match: (u) => u.startsWith("/settings/payments") },
    { label: "HR & Payroll", href: "/payroll", icon: <IconBriefcase />, match: (u) => u.startsWith("/payroll") },
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {tenant?.onTrial && tenant.trialEnd && <TrialStrip endsAt={tenant.trialEnd} />}

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-hairline bg-surface transition-transform lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center gap-2 px-5 py-5">
            {logoUrl ? (
              <img src={logoUrl} alt={tenant?.name ?? "Wivae"} className="h-7 w-auto" />
            ) : (
              <span
                className="font-display text-lg font-semibold tracking-tight"
                style={primary ? { color: primary } : undefined}
              >
                {tenant?.name ?? "Wivae"}
              </span>
            )}
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
            {nav.map((item) => (
              <SidebarLink key={item.label} item={item} url={url} color={primary} />
            ))}
          </nav>

          {isAdmin && (
            <div className="border-t border-hairline p-3">
              <SidebarLink
                item={{ label: "Settings", href: "/settings/general", icon: <IconGear />, match: (u) => u.startsWith("/settings") }}
                url={url}
                color={primary}
              />
            </div>
          )}
          <div className="border-t border-hairline p-3">
            <button
              onClick={() => router.post("/logout")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-canvas hover:text-ink"
            >
              <IconSignOut />
              Sign Out
            </button>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main column */}
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3 lg:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-2 text-muted hover:bg-canvas lg:hidden"
                aria-label="Open menu"
              >
                <IconMenu />
              </button>

              <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs font-medium text-muted sm:flex">
                <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-positive" : "bg-amber-500"}`} />
                {online ? "Online" : "Offline"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleDark}
                className="rounded-full p-2 text-muted hover:bg-canvas"
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                {dark ? <IconMoon /> : <IconSun />}
              </button>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-canvas"
                >
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full text-sm font-semibold text-white"
                    style={{ background: primary ?? "#1d4ed8" }}
                  >
                    {auth.user?.name?.[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-sm font-medium leading-tight">{auth.user?.name}</span>
                    <span className="block text-xs capitalize leading-tight text-muted">{auth.user?.role}</span>
                  </span>
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-lg">
                      {isAdmin && (
                        <Link href="/settings/general" className="block px-3 py-2 text-sm hover:bg-canvas">
                          Settings
                        </Link>
                      )}
                      <Link href="/settings/account" className="block px-3 py-2 text-sm hover:bg-canvas">
                        Change password
                      </Link>
                      <button
                        onClick={() => router.post("/logout")}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-canvas"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({ item, url, color }: { item: NavItem; url: string; color?: string }) {
  const active = item.href ? (item.match ? item.match(url) : url.startsWith(item.href)) : false;

  const content = (
    <>
      <span className="shrink-0">{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          {item.badge}
        </span>
      )}
      {item.soon && (
        <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">Soon</span>
      )}
    </>
  );

  const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium";

  if (item.soon || !item.href) {
    return (
      <div className={`${base} cursor-default text-muted/60`} title="Coming soon" aria-disabled>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`${base} ${active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-canvas hover:text-ink"}`}
      style={active && color ? { background: `${color}14`, color } : undefined}
    >
      {content}
    </Link>
  );
}

function TrialStrip({ endsAt }: { endsAt: string }) {
  const days = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
  return (
    <div className="bg-positive/10 px-6 py-2 text-center text-sm text-positive">
      {days === 0
        ? "Your trial ends today. Add a plan to keep selling."
        : `${days} day${days === 1 ? "" : "s"} left in your free trial.`}
    </div>
  );
}

// --- Icons: small inline SVGs, no icon package dependency ------------------

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function IconGrid() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>; }
function IconCart() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6" /></svg>; }
function IconBox() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>; }
function IconClipboard() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M8 10h8M8 14h8M8 18h5" /></svg>; }
function IconReceipt() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M6 2h12v19l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6" /></svg>; }
function IconChart() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M4 20V10M11 20V4M18 20v-7" /></svg>; }
function IconSparkle() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>; }
function IconUsers() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 8.5a3 3 0 1 1 3.5 3M21.5 20a5.5 5.5 0 0 0-4-5.3" /></svg>; }
function IconTasks() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M4 6h2l1.5 1.5L11 4M4 12h2l1.5 1.5L11 10M4 18h2l1.5 1.5L11 16M14 6h6M14 12h6M14 18h6" /></svg>; }
function IconStore() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M3 9 4.5 4h15L21 9M3 9v10a1 1 0 0 0 1 1h4v-6h8v6h4a1 1 0 0 0 1-1V9M3 9h18" /></svg>; }
function IconChef() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M8 21h8M9 21v-6M15 21v-6M6.5 8.5a3 3 0 1 1 3-3.9M17.5 8.5a3 3 0 1 0-3-3.9M9.4 4.6a2.6 2.6 0 0 1 5.2 0M6 12a6 6 0 0 0 12 0v3H6Z" /></svg>; }
function IconChip() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2" /></svg>; }
function IconCard() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>; }
function IconBriefcase() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></svg>; }
function IconGear() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.4-2-3.4-2.2.8a7.7 7.7 0 0 0-2.6-1.5L14 2h-4l-.5 2.9a7.7 7.7 0 0 0-2.6 1.5l-2.2-.8-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 15l2 3.4 2.2-.8c.76.66 1.65 1.17 2.6 1.5L10 22h4l.5-2.9a7.7 7.7 0 0 0 2.6-1.5l2.2.8 2-3.4Z" /></svg>; }
function IconSignOut() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>; }
function IconMenu() { return <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><path d="M3 6h18M3 12h18M3 18h18" /></svg>; }
function IconSun() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>; }
function IconMoon() { return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>; }
