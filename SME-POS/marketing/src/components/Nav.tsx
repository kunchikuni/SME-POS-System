import { REGISTER_URL } from "../config";
import DarkModeToggle from "../islands/DarkModeToggle";

/**
 * Ported from Home.tsx's Nav. Rendered whole as one small hydrated island
 * (see index.astro's <Nav client:load />) rather than trying to hydrate
 * just the toggle button within an otherwise-static parent — Astro's
 * client:* directives only apply to a component invoked directly in an
 * .astro template, not one nested inside another framework component's
 * props, so a surgical split isn't available here. The nav bar is small;
 * shipping it as one island costs little.
 */
export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-md transition-colors">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white shadow-[0_0_16px_rgba(124,58,237,0.5)]">
            W
          </div>
          <span className="font-display text-lg font-bold tracking-tight">WivaePOS</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted sm:flex">
          <a href="#features" className="hover:text-ink transition-colors">Features</a>
          <a href="#pricing" className="hover:text-ink transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-ink transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <DarkModeToggle />
          {/* To the "Sign in to your workspace" section: signing in only works on a
              workspace's own address, so a bare /login link could never sign anyone in. */}
          <a href="#signin" className="text-sm text-muted hover:text-ink transition-colors">
            Sign in
          </a>
          <a
            href={REGISTER_URL}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:opacity-90 transition-opacity"
          >
            Start free trial
          </a>
        </div>
      </div>
    </header>
  );
}
