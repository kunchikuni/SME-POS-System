import type { Category, Product } from '../types/contract';

/**
 * Finding a product in the till's local catalogue (Receive stock).
 *
 * It used to match only a substring of the name (plus an exact barcode), so
 * typing a category ("beef", "drinks") or a SKU found nothing unless the
 * product name itself contained it, and only the first 8 hits were listed.
 *
 * Now: every word typed must match somewhere in the product's name, category,
 * SKU or barcode (so "pork chops", "beef 1kg" and "SKU-000012" all work), and
 * results are ranked name-first — names that start with what was typed, then
 * names that contain it, then matches found through the category/SKU/barcode.
 * A full barcode match (a scan) returns just that product.
 */
export function searchProducts(products: Product[], categories: Category[], query: string, limit = 20): Product[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const active = products.filter((p) => p.is_active !== false);

    const scanned = active.filter((p) => p.barcode && p.barcode.toLowerCase() === q);
    if (scanned.length > 0) return scanned;

    const categoryName = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
    const words = q.split(/\s+/);

    const hits: { product: Product; rank: number }[] = [];
    for (const product of active) {
        const name = product.name.toLowerCase();
        const category = product.category_id ? categoryName.get(product.category_id) ?? '' : '';
        const haystack = `${name} ${category} ${(product.sku ?? '').toLowerCase()} ${(product.barcode ?? '').toLowerCase()}`;
        if (!words.every((w) => haystack.includes(w))) continue;

        const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : words.every((w) => name.includes(w)) ? 2 : 3;
        hits.push({ product, rank });
    }

    hits.sort((a, b) => a.rank - b.rank || a.product.name.localeCompare(b.product.name));
    return hits.slice(0, limit).map((h) => h.product);
}

/** The catalogue A–Z — what to list before anything has been typed. */
export function browseProducts(products: Product[], limit = 12): Product[] {
    return products
        .filter((p) => p.is_active !== false)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, limit);
}
