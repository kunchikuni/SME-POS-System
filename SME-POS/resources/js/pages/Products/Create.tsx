import { Head, useForm } from "@inertiajs/react";
import type { FormEvent } from "react";
import AppLayout from "../../Layouts/AppLayout";

interface Category { id: string; name: string; }

export default function ProductCreate({ categories }: { categories: Category[] }) {
  const form = useForm({
    name: "",
    sku: "",
    barcode: "",
    category_id: "",
    price: "",
    type: "retail",
    track_stock: true,
    initial_qty: "0",
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    form.post("/products");
  }

  return (
    <AppLayout>
      <Head title="Add product" />
      <h1 className="font-display text-xl font-semibold tracking-tight">Add product</h1>

      <form onSubmit={submit} className="mt-6 max-w-xl space-y-5">
        <Field label="Name" value={form.data.name} onChange={(v) => form.setData("name", v)} error={form.errors.name} autoFocus />

        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU" value={form.data.sku} onChange={(v) => form.setData("sku", v)} error={form.errors.sku} />
          <Field label="Barcode (optional)" value={form.data.barcode} onChange={(v) => form.setData("barcode", v)} error={form.errors.barcode} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Price (USD)</span>
            <input
              inputMode="decimal"
              value={form.data.price}
              onChange={(e) => form.setData("price", e.target.value)}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 font-tabular text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
              placeholder="0.00"
            />
            {form.errors.price && <span className="mt-1 block text-xs text-red-600">{form.errors.price}</span>}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Category</span>
            <select
              value={form.data.category_id}
              onChange={(e) => form.setData("category_id", e.target.value)}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.data.track_stock}
            onChange={(e) => form.setData("track_stock", e.target.checked)}
          />
          Track stock for this product
        </label>

        {form.data.track_stock && (
          <Field
            label="Opening quantity"
            value={form.data.initial_qty}
            onChange={(v) => form.setData("initial_qty", v.replace(/\D/g, ""))}
            error={form.errors.initial_qty}
          />
        )}

        <button
          type="submit"
          disabled={form.processing}
          className="rounded-lg bg-brand-500 px-4 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {form.processing ? "Saving…" : "Save product"}
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
