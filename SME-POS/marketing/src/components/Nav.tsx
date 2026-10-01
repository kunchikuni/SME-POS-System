import { REGISTER_URL } from "../config";

/**
 * Rendered whole as one small hydrated island (see index.astro's
 * <Nav client:load />) rather than trying to hydrate just the toggle —
 * Astro's client:* directives only apply to a component invoked directly in
 * an .astro template, not one nested inside another framework component's
 * props. The bar is small; shipping it as one island costs little.
 *
 * Phone-first: most visitors arrive on a phone, so nothing here may wrap —
 * the links collapse away, and the call to action shortens to "Start free".
 */
export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/80 backdrop-blur-xl transition-colors">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="WivaePOS home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_6px_18px_-4px_rgba(124,58,237,0.6)]">
            <svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M12 18l9 28 11-19 11 19 9-28" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-lg font-bold tracking-tight">WivaePOS</span>
        </a>

        <nav className="hidden items-center gap-1 text-sm font-medium text-muted md:flex" aria-label="Sections">
          {[
            ["#features", "Features"],
            ["#how", "How it works"],
            ["#pricing", "Pricing"],
            ["#faq", "FAQ"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3.5 py-2 transition-colors hover:bg-brand-500/10 hover:text-ink">
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* To the "Sign in to your workspace" section: signing in only works on a
              workspace's own address, so a bare /login link could never sign anyone in. */}
          <a href="#signin" className="whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:text-ink sm:px-3.5">
            Sign in
          </a>
          <a
            href={REGISTER_URL}
            className="whitespace-nowrap rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_-8px_rgba(124,58,237,0.7)] transition-all hover:-translate-y-px hover:shadow-[0_12px_26px_-8px_rgba(124,58,237,0.8)] sm:px-4"
          >
            <span className="sm:hidden">Start free</span>
            <span className="hidden sm:inline">Start free trial</span>
          </a>
        </div>
      </div>
    </header>
  );
}
