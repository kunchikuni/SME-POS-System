import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";

/**
 * Where the till lives. In production it's served by the same origin at
 * /pos/. In dev it's its own Vite server on :5174 (pos/vite.config.ts) —
 * the dashboard's /pos proxy goes to the API server, not the till.
 */
export function tillBaseUrl(): string {
  return import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:5174/pos/`
    : "/pos/";
}

/** How to name the business in a sentence ("Your pharmacy is ready"), by business type key. */
const KIND: Record<string, string> = {
  retail: "shop", supermarket: "supermarket", restaurant: "restaurant", bottlestore: "bottle store",
  pharmacy: "pharmacy", clothing: "clothing store", butchery: "butchery", hardware: "hardware store",
  workshop: "workshop", salon: "salon",
};

/**
 * "Get selling" — sign-up to first sale in three steps. Each tick comes from
 * real data (GET /onboarding), so it can't claim something that hasn't
 * happened; it re-checks whenever the owner comes back to this tab (e.g.
 * after ringing up the test sale in the till tab).
 */
export function GetSelling({ welcome }: { welcome: boolean }) {
  const { data, refetch } = useQuery(() => api.onboarding.status(), []);
  const [dismissed, setDismissed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onFocus = () => { void refetch(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  const { submit: loadStarter, loading: loadingStarter, error: starterError } = useMutation(
    () => api.onboarding.loadStarterProducts(),
    { onSuccess: (r) => { setNotice(r?.message ?? null); void refetch(); } },
  );

  const [openingTill, setOpeningTill] = useState(false);
  const [tillError, setTillError] = useState<string | null>(null);

  /**
   * Creates a device and opens the till already paired to it: the token
   * rides in the URL fragment (#pair=…), which the browser never sends to a
   * server or writes to access logs, and PairDevice wipes it from the
   * address bar the moment it's read. The tab is opened BEFORE the request
   * so a pop-up blocker still treats it as part of the click.
   */
  async function openTill() {
    setOpeningTill(true);
    setTillError(null);
    const tab = window.open("", "_blank");
    try {
      const { token } = await api.onboarding.createTill();
      const url = `${tillBaseUrl()}#pair=${token}`;
      if (tab) tab.location.href = url;
      else window.location.href = url; // pop-ups blocked — use this tab
      void refetch();
    } catch (err) {
      tab?.close();
      setTillError(err instanceof Error ? err.message : "Couldn't create the till.");
    } finally {
      setOpeningTill(false);
    }
  }

  if (!data || dismissed) return null;
  const { steps, mode } = data;
  const kind = KIND[data.businessType?.key ?? mode] ?? "store";
  const done = [steps.products, steps.till, steps.sale].filter(Boolean).length;
  if (done === 3 && !welcome) return null; // finished — get out of the way

  return (
    <div className="mt-6 rounded-xl border border-brand-50 bg-brand-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-brand-700">
            {welcome && done === 0 ? `Your ${kind} is ready 🎉` : "Get selling"}
            <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-brand-700">{done}/3</span>
          </h2>
          <p className="mt-0.5 text-sm text-brand-700/80">
            {done === 3 ? "You've made your first sale — you're up and running." : "Three steps to your first sale."}
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-brand-500 hover:text-brand-700" aria-label="Hide">✕</button>
      </div>

      {notice && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm text-positive">{notice}</p>}

      <ol className="mt-4 space-y-2">
        <Step n={1} done={steps.products} title="Add what you sell">
          {!steps.products && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to="/products/create" className="btn-primary text-xs">Add a product</Link>
              <button onClick={() => loadStarter(undefined)} disabled={loadingStarter} className="btn-secondary text-xs disabled:opacity-50">
                {loadingStarter ? "Loading…" : "Load example products"}
              </button>
              <Link to="/products/import" className="btn-secondary text-xs">Import a CSV</Link>
            </div>
          )}
          {!steps.products && (
            <p className="mt-1.5 text-xs text-muted">Examples are typical items for a {kind}, with prices and stock — edit or delete them any time.</p>
          )}
          {starterError && <p className="mt-1 text-xs text-red-600">{starterError}</p>}
        </Step>

        <Step n={2} done={steps.till} title="Open the till on this device">
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={() => void openTill()} disabled={openingTill} className={`${steps.till ? "btn-secondary" : "btn-primary"} text-xs disabled:opacity-50`}>
              {openingTill ? "Opening…" : steps.till ? "Set up another till here" : "Open the till"}
            </button>
            {steps.till && <a href={tillBaseUrl()} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">Go to the till →</a>}
          </div>
          {!steps.till && (
            <p className="mt-1.5 text-xs text-muted">Opens already paired — install it from there to keep it on your home screen. For another device, use Devices → Add device.</p>
          )}
          {tillError && <p className="mt-1 text-xs text-red-600">{tillError}</p>}
        </Step>

        <Step n={3} done={steps.sale} title="Make your first sale">
          {!steps.sale && (
            <p className="mt-1 text-xs text-muted">
              In the till, tap your name and enter the 4-digit PIN you chose at sign-up, then ring something up. This ticks off once it syncs.
            </p>
          )}
        </Step>
      </ol>
    </div>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg bg-surface px-3 py-2.5">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold ${done ? "border-positive bg-positive text-white" : "border-hairline text-muted"}`}>
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className={done ? "text-muted line-through" : "font-medium text-ink"}>{title}</p>
        {children}
      </div>
    </li>
  );
}
