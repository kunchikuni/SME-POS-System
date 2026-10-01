import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";

interface Category { id: string; name: string; trackStock: boolean; }

export default function ProductCreate() {
  usePageTitle("Add product");
  const navigate = useNavigate();
  const { data } = useQuery(() => api.products.formData(), []);
  const categories: Category[] = data?.categories ?? [];
  const { data: branchData } = useQuery(() => api.branches.list(), []);
  const branches = branchData?.branches ?? [];
  const defaultBranchId = branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? "";

  const [form, setForm] = useState({
    name: "",
    barcode: "",
    categoryId: "",
    price: "",
    type: "retail",
    trackStock: true,
    initialQty: "0",
    branchId: "", // "" until chosen = the default branch
  });
  const stockBranchId = form.branchId || defaultBranchId;
  // Picking a category sets whether stock is tracked (off for "Services" and the
  // like) — until the owner touches the tick box themselves, after which their
  // choice stands whatever category they pick.
  const [trackTouched, setTrackTouched] = useState(false);

  function chooseCategory(categoryId: string) {
    const category = categories.find((c) => c.id === categoryId);
    setForm((f) => ({
      ...f,
      categoryId,
      ...(category && !trackTouched ? { trackStock: category.trackStock } : {}),
    }));
  }

  const { submit, loading, errors, error } = useMutation(
    (d: typeof form) => api.products.create({
      name: d.name,
      barcode: d.barcode || null,
      categoryId: d.categoryId || null,
      priceCents: Math.round(parseFloat(d.price || "0") * 100),
      type: d.type,
      trackStock: d.trackStock,
      initialQty: d.trackStock ? parseInt(d.initialQty || "0", 10) : 0,
      branchId: stockBranchId || null,
    }),
    { onSuccess: () => navigate("/products") }
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(form);
  }

  return (
    <AppLayout>
      <h1 className="font-display text-xl font-semibold tracking-tight">Add product</h1>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-5">
        <Field label="Name" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} error={errors.name} autoFocus />

        <p className="text-xs text-muted">SKU is assigned automatically when you save.</p>

        <Field label="Barcode (optional)" value={form.barcode} onChange={(v) => setForm(f => ({ ...f, barcode: v }))} error={errors.barcode} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Price (USD)</span>
            <input
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 font-tabular text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
              placeholder="0.00"
            />
            {errors.priceCents && <span className="mt-1 block text-xs text-red-600">{errors.priceCents}</span>}
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-sm font-medium">
              Category
              <Link to="/categories" className="text-xs font-normal text-brand-600 hover:underline">Manage categories</Link>
            </span>
            <select
              value={form.categoryId}
              onChange={(e) => chooseCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.trackStock}
              onChange={(e) => { setTrackTouched(true); setForm(f => ({ ...f, trackStock: e.target.checked })); }}
            />
            Track stock for this product
          </label>
          <p className="mt-1 text-xs text-muted">
            Leave this off for services and labour — there's nothing to count, so it never shows as out of stock.
          </p>
        </div>

        {form.trackStock && (
          <Field
            label="Opening quantity"
            value={form.initialQty}
            onChange={(v) => setForm(f => ({ ...f, initialQty: v.replace(/\D/g, "") }))}
            error={errors.initialQty}
          />
        )}

        {/* Opening stock belongs to ONE branch — say which, rather than it
            silently landing on the default. Single-branch tenants skip this. */}
        {form.trackStock && branches.length > 1 && (
          <label className="block">
            <span className="text-sm font-medium">Opening stock goes to</span>
            <select
              value={stockBranchId}
              onChange={(e) => setForm(f => ({ ...f, branchId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.isDefault ? " (default)" : ""}</option>
              ))}
            </select>
            {errors.branchId && <span className="mt-1 block text-xs text-red-600">{errors.branchId}</span>}
          </label>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-500 px-4 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save product"}
        </button>
      </form>
    </AppLayout>
  );
}

function Field({ label, value, onChange, error, autoFocus = false }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        aria-invalid={Boolean(error)}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
