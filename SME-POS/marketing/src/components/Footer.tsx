import { IconArrowRight, IconFacebook, IconInstagram, IconLinkedin, IconTwitter } from "./Icons";
import { REGISTER_URL } from "../config";

export function FooterCta() {
  return (
    <section className="px-5 pb-24 pt-4 sm:px-6">
      <div className="reveal relative isolate mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-[#0a0612] px-6 py-16 text-center shadow-[0_40px_90px_-40px_rgba(124,58,237,0.7)] ring-1 ring-white/10 sm:px-12 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(28rem 22rem at 0% 0%, rgba(124,58,237,0.42), transparent 70%)," +
                "radial-gradient(28rem 22rem at 100% 100%, rgba(217,70,239,0.26), transparent 70%)",
            }}
          />
          <div className="hero-grid absolute inset-0" />
        </div>
        <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tight text-white text-balance sm:text-5xl">
          Ready to stop losing sales to load-shedding?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/60">
          Start your 7-day free trial — no credit card, and your first sale can be minutes away.
        </p>
        <a
          href={REGISTER_URL}
          className="group mt-9 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-[#1e1147] shadow-[0_14px_40px_-12px_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5"
        >
          Start your free trial
          <span className="transition-transform group-hover:translate-x-0.5"><IconArrowRight /></span>
        </a>
      </div>
    </section>
  );
}

export function Footer() {
  const heading = "text-xs font-semibold uppercase tracking-[0.16em] text-muted";
  const link = "transition-colors hover:text-ink";
  return (
    <footer className="border-t border-hairline bg-surface px-6 py-14 transition-colors">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden="true">
                  <path d="M12 18l9 28 11-19 11 19 9-28" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="font-display text-lg font-bold tracking-tight">WivaePOS</span>
            </div>
            <p className="mt-3 max-w-[16rem] text-sm leading-relaxed text-muted">Point of sale that never stops selling.</p>
          </div>
          <div>
            <p className={heading}>Company</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><a href="https://wivae.cyaen.net/" className={link}>About</a></li>
              <li><a href="#" className={link}>Partners</a></li>
              <li><a href="#" className={link}>Careers</a></li>
              <li><a href="#" className={link}>Blog</a></li>
            </ul>
          </div>
          <div>
            <p className={heading}>Contact</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li>nokutendac@cyaen.net</li>
              <li>+263 71 057 1364</li>
            </ul>
          </div>
          <div>
            <p className={heading}>Follow</p>
            <div className="mt-4 flex gap-3">
              {[IconFacebook, IconInstagram, IconLinkedin, IconTwitter].map((Icon, i) => (
                <a
                  key={i}
                  href="https://www.facebook.com/cyaenzw"
                  aria-label="Social link — placeholder"
                  className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-muted transition-colors hover:border-brand-500/40 hover:text-ink"
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-12 border-t border-hairline pt-6 text-xs text-muted">
          © {new Date().getFullYear()} WivaePOS. Tech · Innovate · Transform.
        </p>
      </div>
    </footer>
  );
}
