import { Head, Link, router } from "@inertiajs/react";
import AppLayout from "../../Layouts/AppLayout";

interface Row {
  id: string;
  name: string;
  sku: string;
  price: string;
  category: string | null;
  onHand: number;
  tracked: boolean;
}

interface Paginated<T> {
  data: T[];
  links: { url: string | null; label: string; active: boolean }[];
}

export default function ProductsIndex({ products }: { products: Paginated<Row> }) {
  return (
    <AppLayout>
      <Head title="Products" />

      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold tracking-tight">Products</h1>
        <div className="flex gap-2">
          <Link
            href="/products/import"
            className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:bg-canvas"
          >
            Import CSV
          </Link>
          <Link
            href="/products/create"
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Add product
          </Link>
        </div>
      </div>

      {products.data.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-surface p-8 text-center">
          <p className="font-medium">No products yet</p>
          <p className="mt-1 text-sm text-muted">
            Add one by hand or import a CSV to get your catalogue in fast.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-hairline bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-hairline text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">On hand</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.data.map((p) => (
                <tr key={p.id} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted">{p.sku}</td>
                  <td className="px-4 py-3 text-muted">{p.category ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-tabular">${p.price}</td>
                  <td className="px-4 py-3 text-right font-tabular">
                    {p.tracked ? p.onHand : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() =>
                        confirm(`Remove ${p.name}?`) &&
                        router.delete(`/products/${p.id}`)
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
