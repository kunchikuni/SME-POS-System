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
  const [restockBranchId, setRestockBranchId] = useState<string>("");
  // "" = all branches. Kept in the URL so a filtered view survives reloads.
  const [branchFilter, setBranchFilter] = useState(searchParams.get("branch") ?? "");
  const { flash, showFlash } = useFlash();

  const { data, loading, refetch } = useQuery(
    () => api.products.list({ q, page: String(page), ...(branchFilter ? { branchId: branchFilter } : {}) }),
    [q, page, branchFilter],
  );

  // Live branches, default first — returned with the list, so the filter,
  // the per-branch split and the restock picker all agree on one set.
  const branches = data?.branches ?? [];
  const multiBranch = branches.length > 1;
  const filterName = branches.find((b) => b.id === branchFilter)?.name;

  function changeBranchFilter(id: string) {
    setBranchFilter(id);
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("branch", id); else next.delete("branch");
    setSearchParams(next, { replace: true });
  }

  const { submit: deleteProduct } = useMutation(
    (id: string) => api.products.delete(id),
    { onSuccess: () => { showFlash("Product deleted."); refetch(); } },
  );

  const { submit: restock } = useMutation(
    ({ id, qty, branchId }: { id: string; qty: number; branchId?: string }) =>
      api.products.restock(id, qty, branchId || undefined),
    { onSuccess: (r) => { showFlash(r?.message ?? "Stock updated."); setRestocking(null); refetch(); } },
  );

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 50;

  function openRestock(id: string) {
    setRestocking(id);
    setRestockQty(1);
    // Explicit branch, never an unnamed "default": the one being viewed, or
    // the default branch (first in the list) in the all-branches view.
    setRestockBranchId(branchFilter || branches[0]?.id || "");
  }

  // ── Stock count (stock take) ───────────────────────────────────────────
  const [counting, setCounting] = useState<string | null>(null);
  const [countQty, setCountQty] = useState("");
  const [countBranchId, setCountBranchId] = useState("");

  const { submit: submitCount, loading: countSaving, error: countError } = useMutation(
    ({ id, counted, branchId }: { id: string; counted: number; branchId?: string }) =>
      api.products.count(id, counted, branchId || undefined),
    { onSuccess: (r) => { showFlash(r?.message ?? "Stock count saved."); setCounting(null); refetch(); } },
  );

  function openCount(id: string) {
    setCounting(id);
    setCountQty("");
    setCountBranchId(branchFilter || branches[0]?.id || "");
  }

  const countProduct = products.find((p) => p.id === counting);
  // Single-branch tenants have no picker; their one level is the product's onHand.
  const countSystemQty = multiBranch
    ? countProduct?.byBranch.find((b) => b.branchId === countBranchId)?.qty ?? 0
    : countProduct?.onHand ?? 0;
  const countValue = countQty === "" ? null : parseInt(countQty, 10);

  const restockProduct = products.find((p) => p.id === restocking);
  const restockCurrent = restockProduct?.byBranch.find((b) => b.branchId === restockBranchId)?.qty ?? 0;

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

      {/* Search + branch filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search by name, SKU, or barcode…"
          className="w-full max-w-sm rounded-xl border border-hairline bg-surface px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {multiBranch && (
          <select
            value={branchFilter}
            onChange={(e) => changeBranchFilter(e.target.value)}
            aria-label="Branch"
            className="rounded-xl border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
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
                  <th className="px-4 py-3 text-right">
                    On Hand{multiBranch && <span className="normal-case tracking-normal"> · {filterName ?? "all branches"}</span>}
                  </th>
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
                      {/* All-branches view: show where the stock actually is,
                          so a total can't hide one branch running out. */}
                      {multiBranch && !branchFilter && p.tracked && p.byBranch.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-muted">
                          {p.byBranch.map((b) => `${b.branch} ${b.qty}`).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {p.tracked && (
                          <button
                            onClick={() => openRestock(p.id)}
                            className="rounded-lg border border-hairline px-2 py-1 text-xs hover:bg-canvas"
                          >Restock</button>
                        )}
                        {p.tracked && (
                          <button
                            onClick={() => openCount(p.id)}
                            title="Stock take — set to what's actually on the shelf"
                            className="rounded-lg border border-hairline px-2 py-1 text-xs hover:bg-canvas"
                          >Count</button>
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

      {/* Stock count modal */}
      {counting && countProduct && (
        <Modal title="Stock count" onClose={() => setCounting(null)}>
          <p className="mb-3 text-sm text-muted">
            How many <span className="font-medium text-ink">{countProduct.name}</span> are physically there? The level is set to this
            and the difference is recorded as an adjustment in the stock history.
          </p>

          {multiBranch && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-muted">Branch</label>
              <select
                value={countBranchId}
                onChange={(e) => setCountBranchId(e.target.value)}
                className="w-full rounded-xl border border-hairline px-3 py-2 text-sm"
              >
                {branches.map((b, i) => (
                  <option key={b.id} value={b.id}>{b.name}{i === 0 ? " (default)" : ""}</option>
                ))}
              </select>
            </div>
          )}

          <label className="mb-1 block text-xs font-medium text-muted">Counted quantity</label>
          <input
            type="number"
            min={0}
            autoFocus
            value={countQty}
            onChange={(e) => setCountQty(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-full rounded-xl border border-hairline px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted">
            System says <span className={countSystemQty < 0 ? "font-semibold text-red-600" : ""}>{countSystemQty}</span>
            {countValue !== null && !Number.isNaN(countValue) && (
              <> → {countValue} ({countValue - countSystemQty === 0 ? "no change" : `${countValue - countSystemQty > 0 ? "+" : ""}${countValue - countSystemQty}`})</>
            )}
          </p>
          {countError && <p className="mt-2 text-xs text-red-600">{countError}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setCounting(null)} className="btn-secondary text-sm">Cancel</button>
            <button
              disabled={countSaving || countValue === null || Number.isNaN(countValue)}
              onClick={() => countValue !== null && submitCount({ id: countProduct.id, counted: countValue, branchId: countBranchId })}
              className="btn-primary text-sm disabled:opacity-50"
            >{countSaving ? "Saving…" : "Save count"}</button>
          </div>
        </Modal>
      )}

      {/* Restock modal */}
      {restocking && (
        <Modal title="Restock" onClose={() => setRestocking(null)}>
          <p className="text-sm text-muted mb-3">
            Enter qty to add to stock{restockProduct ? ` for ${restockProduct.name}` : ""}.
          </p>
          <input type="number" min={1} value={restockQty} onChange={(e) => setRestockQty(Number(e.target.value))}
            className="w-full rounded-xl border border-hairline px-3 py-2 text-sm" />

          {/* Only shown for multi-branch tenants — single-branch tenants keep
              the one-field flow and land on their only branch. Every option
              is a named branch (no anonymous "Default branch"), preselected
              to the branch being viewed. */}
          {multiBranch && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Branch</label>
              <select
                value={restockBranchId}
                onChange={(e) => setRestockBranchId(e.target.value)}
                className="w-full rounded-xl border border-hairline px-3 py-2 text-sm"
              >
                {branches.map((b, i) => (
                  <option key={b.id} value={b.id}>{b.name}{i === 0 ? " (default)" : ""}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Currently {restockCurrent} there → {restockCurrent + (restockQty > 0 ? restockQty : 0)} after restock.
              </p>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setRestocking(null)} className="btn-secondary text-sm">Cancel</button>
            <button
              onClick={() => restock({ id: restocking, qty: restockQty, branchId: restockBranchId })}
              className="btn-primary text-sm"
            >Confirm</button>
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
