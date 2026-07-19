import { Head, Link, router } from "@inertiajs/react";
import { useEffect, useState } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface Row {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  barcode: string | null;
  price: string;
  category: string | null;
  onHand: number;
  tracked: boolean;
  lowStock: boolean;
  margin: number | null;
}

interface Paginated<T> {
  data: T[];
  links: { url: string | null; label: string; active: boolean }[];
}

interface Summary {
  total_products: number;
  low_stock: number;
  valuation_cents: number;
}

interface Props {
  products: Paginated<Row>;
  filters: { q: string };
  summary: Summary;
  [key: string]: unknown;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function ProductsIndex({ products, filters, summary }: Props) {
  const [q, setQ] = useState(filters.q ?? "");

  // Debounced server-side search — keeps pagination and filtering in one place.
  useEffect(() => {
    if (q === (filters.q ?? "")) return;
    const t = setTimeout(() => {
      router.get("/products", q ? { q } : {}, { preserveState: true, replace: true });
    }, 300);
    return () => clearTimeout(t);
    // filters.q is the server-confirmed value; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <AppLayout>
      <Head title="Inventory" />

      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">Inventory</h1>
        <p className="mt-1 text-sm text-muted">Manage your products and stock levels</p>
      </div>

      {/* Tools */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/products/barcodes"
          className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:bg-canvas"
        >
          Get barcodes
        </Link>
        <Link
          href="/products/import"
          className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:bg-canvas"
        >
          Mass import
        </Link>
        <a
          href="/products/export"
          className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:bg-canvas"
        >
          Export
        </a>
        <Link
          href="/products/create"
          className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          + Add product
        </Link>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total products" value={String(summary.total_products)} tone="brand" />
        <Stat
          label="Low stock items"
          value={String(summary.low_stock)}
          tone={summary.low_stock > 0 ? "warn" : "muted"}
        />
        <Stat label="Total inventory value" value={money(summary.valuation_cents)} tone="good" />
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products by name, brand, SKU, or barcode…"
        className="mt-6 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
      />

      {products.data.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-surface p-8 text-center">
          <p className="font-medium">{q ? "No products match that search" : "No products yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {q
              ? "Try a different name, SKU, or barcode."
              : "Add one by hand or import a CSV to get your catalogue in fast."}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-hairline bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-hairline text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
                <th className="px-4 py-3 text-right font-medium">On hand</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.data.map((p) => (
                <tr key={p.id} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted">{p.brand ?? p.category ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.sku}</td>
                  <td className="px-4 py-3 font-tabular text-muted">{p.barcode ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-tabular">${p.price}</td>
                  <td className="px-4 py-3 text-right font-tabular text-muted">
                    {p.margin === null ? "—" : `${p.margin}%`}
                  </td>
                  <td className="px-4 py-3 text-right font-tabular">
                    {!p.tracked ? (
                      "—"
                    ) : p.lowStock ? (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700">
                        {p.onHand}
                      </span>
                    ) : (
                      p.onHand
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() =>
                        confirm(`Remove ${p.name}?`) && router.delete(`/products/${p.id}`)
                      }
                      className="text-xs text-muted hover:text-red-600"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "warn" | "good" | "muted";
}) {
  const chip = {
    brand: "bg-brand-50 text-brand-600",
    warn: "bg-amber-50 text-amber-600",
    good: "bg-emerald-50 text-emerald-600",
    muted: "bg-canvas text-muted",
  }[tone];

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className={`h-6 w-6 rounded-md ${chip}`} />
      </div>
      <div className="mt-1 font-tabular text-2xl font-semibold">{value}</div>
    </div>
  );
}
