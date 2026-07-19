<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Printable barcode label sheet. Products that already have a barcode are
 * rendered as-is; products without one fall back to their SKU, so a merchant can
 * label shelf stock that never came with a manufacturer barcode.
 *
 * Barcodes are drawn client-side (Code 128 via JsBarcode) rather than generated
 * here: the browser is doing the printing anyway, and it keeps a barcode
 * encoder out of the backend.
 */
class BarcodeSheetController extends Controller
{
    public function __invoke(): Response
    {
        abort_unless(auth()->user()->can('administer'), 403);

        $products = Product::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'sku', 'barcode', 'price_cents'])
            ->map(fn (Product $p) => [
                'id'    => $p->id,
                'name'  => $p->name,
                'sku'   => $p->sku,
                // Fall back to SKU so every product is labellable.
                'code'  => $p->barcode ?: $p->sku,
                'price' => $p->priceDollars(),
            ]);

        return Inertia::render('Products/Barcodes', ['products' => $products]);
    }
}
