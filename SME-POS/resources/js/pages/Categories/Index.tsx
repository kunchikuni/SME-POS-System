import { useState } from "react";
import AppLayout from "../../Layouts/AppLayout.js";
import { usePageTitle, useQuery, useMutation } from "../../lib/hooks.js";
import { api } from "../../lib/api.js";

interface Category { id: string; name: string; products_count: number; }

export default function CategoriesIndex() {
  usePageTitle("Categories");
  const { data, loading, refetch } = useQuery(() => api.categories.list(), []);
  const [name, setName] = useState("");

  const categories: Category[] = (data?.categories ?? []) as Category[];

  const { submit: createCategory, loading: creating, errors } = useMutation(
    (n: string) => api.categories.create(n),
    {
      onSuccess: () => {
        setName("");
        refetch();
      },
    }
  );

  const { submit: deleteCategory } = useMutation(
    (id: string) => api.categories.delete(id),
    { onSuccess: () => refetch() }
  );

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) createCategory(name.trim());
  }

  return (
    <AppLayout>
      <h1 className="font-display text-xl font-semibold tracking-tight">Categories</h1>

      <form onSubmit={add} className="mt-6 flex max-w-md gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category"
          className="flex-1 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          Add
        </button>
      </form>
      {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}

      {loading ? (
        <div className="mt-8 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <ul className="mt-6 max-w-md divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="flex items-center gap-3 text-muted">
                <span className="text-xs">{c.products_count} products</span>
                <button
                  onClick={() => confirm(`Remove ${c.name}?`) && deleteCategory(c.id)}
                  className="text-xs hover:text-red-600"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
          {categories.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">No categories yet.</li>
          )}
        </ul>
      )}
    </AppLayout>
  );
}
