import { Link, router, usePage } from "@inertiajs/react";
import type { PropsWithChildren } from "react";
import type { SharedProps } from "../lib/types";

/**
 * Dashboard shell for signed-in staff. Header carries the tenant name (their
 * brand, not ours, once white-label lands), and the trial banner counts down
 * so an owner always knows where they stand.
 */
export default function AppLayout({ children }: PropsWithChildren) {
  const page = usePage<SharedProps>();
  const { tenant, auth } = page.props;
  const url = page.url;
  const theme = tenant?.theme;
  const primary = theme?.primary;
  const logoUrl = theme?.logo_url;
  const isAdmin = auth.user?.role === "owner" || auth.user?.role === "manager";

  return (
    <div className="min-h-screen">
      {tenant?.onTrial && tenant.trialEnd && <TrialBanner endsAt={tenant.trialEnd} />}

      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
          {auth.user && (
            <span className="flex items-center gap-3 text-sm text-muted">
              {auth.user.name}
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                {auth.user.role}
              </span>
              <button
                onClick={() => router.post("/logout")}
                className="text-xs hover:text-ink"
              >
                Sign out
              </button>
            </span>
          )}
        </div>
      </header>

      {auth.user && (
        <nav className="border-b border-hairline bg-surface">
          <div className="mx-auto flex max-w-6xl gap-1 px-6">
            <NavLink href="/dashboard" active={url === "/" || url.startsWith("/dashboard")} color={primary}>
              Dashboard
            </NavLink>
            <NavLink href="/products" active={url.startsWith("/products")} color={primary}>
              Products
            </NavLink>
            <NavLink href="/devices" active={url.startsWith("/devices")} color={primary}>
              Tills
            </NavLink>
            <NavLink href="/analytics" active={url.startsWith("/analytics")} color={primary}>
              Analytics
            </NavLink>
            {isAdmin && (
              <NavLink href="/settings/branding" active={url.startsWith("/settings")} color={primary}>
                Settings
              </NavLink>
            )}
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  active,
  color,
  children,
}: {
  href: string;
  active: boolean;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={active && color ? { borderColor: color, color: "#0F172A" } : undefined}
      className={`border-b-2 px-3 py-3 text-sm font-medium ${
        active
          ? "border-brand-600 text-ink"
          : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function TrialBanner({ endsAt }: { endsAt: string }) {
  const days = Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000),
  );

  return (
    <div className="bg-positive/10 px-6 py-2 text-center text-sm text-positive">
      {days === 0
        ? "Your trial ends today. Add a plan to keep selling."
        : `${days} day${days === 1 ? "" : "s"} left in your free trial.`}
    </div>
  );
}
