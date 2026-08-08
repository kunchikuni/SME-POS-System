export function OfflineStrip() {
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

export function Features() {
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
