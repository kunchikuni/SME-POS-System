import { useState } from "react";
import { useQuery, useMutation } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";

const dollars = (cents: number) => (cents / 100).toFixed(2);

/**
 * "Suggested for <your business>" — the ready-made products for this kind of
 * business (a butchery's chicken, pork, goat, boerewors…) that aren't in the
 * catalogue yet, addable any time, one by one or all at once.
 *
 * Until now the ready-made set could only be loaded into a completely empty
 * catalogue, so a butchery that had added "Beef" by hand could never get the
 * rest. Each row's price is editable before adding (they're example prices),
 * and products are added with NO stock: the owner then records the real
 * quantity (Restock here, or Receive stock at the till).
 *
 * Open by default while the catalogue is small; collapsed to one line once
 * it's established, so it doesn't nag an owner with 200 products.
 */
export function SuggestedProducts({ productCount, onAdded }: {
  /** Products in the catalogue (pass a large number while searching, to stay collapsed). */
  productCount: number;
  onAdded: (message: string) => void;
}) {
  const { data, refetch } = useQuery(() => api.products.suggestions(), []);
  const [open, setOpen] = useState<boolean | null>(null); // null = decide from the catalogue size
  const [prices, setPrices] = useState<Record<string, string>>({});

  const suggestions = data?.suggestions ?? [];
  const isOpen = open ?? productCount <= 5;

  const { submit, loading, error } = useMutation(
    (items: { name: string; priceCents?: number }[]) => api.products.addSuggestions(items),
    { onSuccess: (r) => { refetch(); onAdded(r?.message ?? "Products added."); } },
  );

  function priceFor(name: string, fallback: number): number {
    const typed = parseFloat(prices[name] ?? "");
    return Number.isFinite(typed) && typed >= 0 ? Math.round(typed * 100) : fallback;
  }

  if (suggestions.length === 0) return null;
  const label = data?.businessType ?? "your business";

  return (
    <section className="mt-4 rounded-xl border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Suggested for {label}</h2>
          <p className="text-xs text-muted">
            {suggestions.length} ready-made product{suggestions.length === 1 ? "" : "s"} you haven't added yet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isOpen && (
            <button
              onClick={() => submit(suggestions.map((s) => ({ name: s.name, priceCents: priceFor(s.name, s.priceCents) })))}
              disabled={loading}
              className="btn-primary text-xs disabled:opacity-50"
            >
              {loading ? "Adding…" : `Add all ${suggestions.length}`}
            </button>
          )}
          <button onClick={() => setOpen(!isOpen)} className="text-xs font-semibold text-brand-600 hover:underline">
            {isOpen ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {isOpen && (
        <>
          <ul className="mt-3 divide-y divide-hairline rounded-lg border border-hairline">
            {suggestions.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{s.name}</p>
                  <p className="text-xs text-muted">{s.category}{s.tracked ? "" : " · not stock-tracked"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted">
                    $
                    <input
                      inputMode="decimal"
                      value={prices[s.name] ?? dollars(s.priceCents)}
                      onChange={(e) => setPrices((p) => ({ ...p, [s.name]: e.target.value.replace(/[^0-9.]/g, "") }))}
                      aria-label={`Price for ${s.name}`}
                      className="w-20 rounded-lg border border-hairline bg-canvas px-2 py-1 text-right text-sm tabular-nums text-ink"
                    />
                  </label>
                  <button
                    onClick={() => submit([{ name: s.name, priceCents: priceFor(s.name, s.priceCents) }])}
                    disabled={loading}
                    className="btn-secondary text-xs disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Prices are examples — change them before adding. Products start with no stock; use Restock (or Receive stock at the till) to record how many you have.
          </p>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </>
      )}
    </section>
  );
}
