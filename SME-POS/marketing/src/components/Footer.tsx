import { IconFacebook, IconInstagram, IconLinkedin, IconTwitter } from "./Icons";
import { REGISTER_URL } from "../config";

export function FooterCta() {
  return (
    <section className="border-t border-hairline px-6 py-16 transition-colors">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Ready to stop losing sales to load-shedding?
        </h2>
        <a
          href={REGISTER_URL}
          className="mt-7 inline-block rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_4px_24px_rgba(124,58,237,0.4)] hover:opacity-90 transition-opacity"
        >
          Start your free trial
        </a>
      </div>
    </section>
  );
}

/** Placeholder structure — real social handles, email, and phone still needed. */
export function Footer() {
  return (
    <footer className="border-t border-hairline bg-surface px-6 py-12 transition-colors">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
                W
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
