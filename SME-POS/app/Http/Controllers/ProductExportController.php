<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams the catalogue out as CSV. Streamed rather than built in memory so a
 * large catalogue can't exhaust PHP's memory limit, and chunked so we never
 * hold every product at once.
 *
 * The column order deliberately matches the importer's expected header, so an
 * export can be edited in a spreadsheet and imported straight back.
 */
class ProductExportController extends Controller
{
    public const COLUMNS = [
        'sku', 'barcode', 'name', 'brand', 'category',
        'price', 'cost', 'tax_class', 'type', 'track_stock',
        'low_stock_threshold', 'on_hand',
    ];

    public function __invoke(): StreamedResponse
    {
        abort_unless(auth()->user()->can('administer'), 403);

        $filename = 'products-' . now()->format('Y-m-d') . '.csv';

        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');
            fputcsv($out, self::COLUMNS);

            Product::query()
                ->with('category:id,name')
                ->withSum('stockLevels as on_hand', 'quantity')
                ->orderBy('name')
                ->chunk(200, function ($products) use ($out) {
                    foreach ($products as $p) {
                        fputcsv($out, [
                            $p->sku,
                            $p->barcode,
                            $p->name,
                            $p->brand,
                            $p->category?->name,
                            $p->priceDollars(),
                            $p->cost_cents !== null
                                ? number_format($p->cost_cents / 100, 2, '.', '')
                                : '',
                            $p->tax_class,
                            $p->type,
                            $p->track_stock ? 'yes' : 'no',
                            $p->low_stock_threshold,
                            (int) ($p->on_hand ?? 0),
                        ]);
                    }
                });

            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
