import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle } from "../../lib/hooks.js";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export default function ProductImport() {
  usePageTitle("Import products");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${BASE_URL}/products/import`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
        body: formData,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError((json as any)?.message ?? "Import failed.");
      } else {
        setSuccess((json as any)?.message ?? "Import complete.");
        setFile(null);
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <h1 className="font-display text-xl font-semibold tracking-tight">Import products</h1>
      <p className="mt-2 max-w-lg text-sm text-muted">
        Upload a CSV with a header row. Recognised columns:{" "}
        <code className="rounded bg-canvas px-1 py-0.5 text-xs">
          sku, name, price, barcode, category, initial_qty
        </code>
        . Re-importing the same SKU updates the product rather than duplicating it.
      </p>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 rounded-xl bg-positive/10 px-3 py-2 text-sm text-positive">{success}</p>}

      <form onSubmit={submit} className="mt-6 max-w-lg space-y-4">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
        />

        <button
          type="submit"
          disabled={loading || !file}
          className="rounded-lg bg-brand-500 px-4 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "Uploading…" : "Start import"}
        </button>
      </form>
    </AppLayout>
  );
}
