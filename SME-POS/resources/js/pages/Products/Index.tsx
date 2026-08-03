import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation, useFlash } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function ProductsIndex() {
  usePageTitle("Products");
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [restocking, setRestocking] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState(1);
  const { flash, showFlash } = useFlash();

  const { data, loading, refetch } = useQuery(
    () => api.products.list({ q, page: String(page) }),
    [q, page],
  );

  const { submit: deleteProduct } = useMutation(
    (id: string) => api.products.delete(id),
    { onSuccess: () => { showFlash("Product deleted."); refetch(); } },
  );

  const { submit: restock } = useMutation(
    ({ id, qty }: { id: string; qty: number }) => api.products.restock(id, qty),
    { onSuccess: () => { showFlash("Stock updated."); setRestocking(null); refetch(); } },
  );

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 50;

  return (
    <AppLayout>
      {/* Flash */}
      {flash.message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${flash.type === "error" ? "bg-red-50 text-red-700" : "bg-positive/10 text-positive"}`}>
          {flash.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Products</h1>
          <p className="mt-1 text-sm text-muted">
            {total} product{total !== 1 ? "s" : ""} · manage your catalogue
          </p>
        </div>
        <div className="flex gap-2">
          <a href={api.products.export()} className="btn-secondary text-sm">Export CSV</a>
          <Link to="/products/barcodes" className="btn-secondary text-sm">Barcodes</Link>
          <Link to="/products/import" className="btn-secondary text-sm">Import</Link>
          <Link to="/products/create" className="btn-primary text-sm">+ New Product</Link>
        </div>
      </div>

      {/* Search */}
      <div className="mt-4">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search by name, SKU, or barcode…"
          className="w-full max-w-sm rounded-xl border border-hairline bg-surface px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center"><Spinner /></div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-canvas text-left text-xs font-semibold uppercase tracking-widest text-muted">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">On Hand</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {products.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No products found.</td></tr>
                )}
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{p.name}</p>
                      {p.brand && <p className="text-xs text-muted">{p.brand}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{p.sku}</td>
                    <td className="px-4 py-3 text-muted">{p.category ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(p.priceCents)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`tabular-nums font-semibold ${p.lowStock ? "text-red-600" : "text-ink"}`}>
                        {p.onHand}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {p.tracked && (
                          <button
                            onClick={() => setRestocking(p.id)}
                            className="rounded-lg border border-hairline px-2 py-1 text-xs hover:bg-canvas"
                          >Restock</button>
                        )}
                        <button
                          onClick={() => { if (confirm(`Delete ${p.name}?`)) deleteProduct(p.id); }}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > perPage && (
            <div className="mt-4 flex justify-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs disabled:opacity-40">← Prev</button>
              <span className="px-3 py-1 text-sm text-muted">Page {page}</span>
              <button disabled={page * perPage >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs disabled:opacity-40">Next →</button>
            </div>
          )}
        </>
      )}

      {/* Restock modal */}
      {restocking && (
        <Modal title="Restock" onClose={() => setRestocking(null)}>
          <p className="text-sm text-muted mb-3">Enter qty to add to stock.</p>
          <input type="number" min={1} value={restockQty} onChange={(e) => setRestockQty(Number(e.target.value))}
            className="w-full rounded-xl border border-hairline px-3 py-2 text-sm" />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setRestocking(null)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={() => restock({ id: restocking, qty: restockQty })} className="btn-primary text-sm">Confirm</button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
