import { Head, useForm } from "@inertiajs/react";
import type { FormEvent } from "react";
import AppLayout from "../../Layouts/AppLayout";

export default function ProductImport() {
  const form = useForm<{ file: File | null }>({ file: null });

  function submit(e: FormEvent) {
    e.preventDefault();
    form.post("/products/import", { forceFormData: true });
  }

  return (
    <AppLayout>
      <Head title="Import products" />
      <h1 className="font-display text-xl font-semibold tracking-tight">Import products</h1>
      <p className="mt-2 max-w-lg text-sm text-muted">
        Upload a CSV with a header row. Recognised columns:{" "}
        <code className="rounded bg-canvas px-1 py-0.5 text-xs">
          sku, name, price, barcode, category, initial_qty
        </code>
        . Re-importing the same SKU updates the product rather than duplicating it.
      </p>

      <form onSubmit={submit} className="mt-6 max-w-lg space-y-4">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => form.setData("file", e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
        />
        {form.errors.file && <p className="text-xs text-red-600">{form.errors.file}</p>}

        <button
          type="submit"
          disabled={form.processing || !form.data.file}
          className="rounded-lg bg-brand-500 px-4 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {form.processing ? "Uploading…" : "Start import"}
        </button>
      </form>
    </AppLayout>
  );
}
