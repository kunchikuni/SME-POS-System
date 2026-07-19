import { Head, Link } from "@inertiajs/react";
import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import AppLayout from "../../Layouts/AppLayout";

interface Item {
  id: string;
  name: string;
  sku: string;
  code: string;
  price: string;
}

interface Props {
  products: Item[];
  [key: string]: unknown;
}

/**
 * Printable shelf/product labels. Each product gets a Code 128 barcode drawn
 * into an SVG at print resolution, laid out on a grid that fits standard A4
 * label sheets. Quantity is per-product so a merchant can print one label for a
 * slow mover and thirty for a fast one.
 */
export default function Barcodes({ products }: Props) {
  const [copies, setCopies] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set(products.map((p) => p.id)));

  const chosen = products.filter((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <AppLayout>
      <Head title="Barcodes" />

      <div className="print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight">Barcode labels</h1>
            <p className="mt-1 text-sm text-muted">
              Products without a barcode fall back to their SKU, so everything is labellable.
            </p>
          </div>
          <Link href="/products" className="text-sm text-muted hover:text-ink">
            ← Back to inventory
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4 rounded-xl border border-hairline bg-surface p-4">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Copies of each</span>
            <input
              type="number"
              min={1}
              max={100}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="w-24 rounded-lg border border-hairline bg-surface px-3 py-2 font-tabular outline-none focus:border-brand-500"
            />
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set(products.map((p) => p.id)))}
              className="rounded-lg border border-hairline px-3 py-2 text-sm hover:bg-canvas"
            >
              Select all
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-hairline px-3 py-2 text-sm hover:bg-canvas"
            >
              Clear
            </button>
          </div>

          <button
            onClick={() => window.print()}
            disabled={chosen.length === 0}
            className="ml-auto rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40"
          >
            Print {chosen.length * copies} label{chosen.length * copies === 1 ? "" : "s"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Print sheet */}
      <div className="mt-8 grid grid-cols-3 gap-3 print:mt-0 print:grid-cols-3 print:gap-2">
        {chosen.flatMap((p) =>
          Array.from({ length: copies }, (_, i) => (
            <Label key={`${p.id}-${i}`} item={p} />
          )),
        )}
      </div>
    </AppLayout>
  );
}

function Label({ item }: { item: Item }) {
  const ref = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, item.code, {
        format: "CODE128",
        displayValue: true,
        fontSize: 12,
        height: 40,
        margin: 0,
        width: 1.6,
      });
      setFailed(false);
    } catch {
      // A code JsBarcode can't encode shouldn't blank the whole sheet.
      setFailed(true);
    }
  }, [item.code]);

  return (
    <div className="break-inside-avoid rounded-lg border border-hairline bg-white p-2 text-center">
      <div className="truncate text-xs font-medium text-black">{item.name}</div>
      <div className="text-xs text-slate-500">${item.price}</div>
      {failed ? (
        <div className="py-3 text-xs text-red-600">Can’t encode “{item.code}”</div>
      ) : (
        <svg ref={ref} className="mx-auto mt-1 max-w-full" />
      )}
    </div>
  );
}
