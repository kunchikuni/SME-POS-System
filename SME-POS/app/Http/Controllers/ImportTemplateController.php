<?php

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * A blank CSV with the exact header the importer expects, plus one example row.
 * Handing merchants the template removes the most common import failure —
 * guessing column names — and it matches ProductExportController::COLUMNS so
 * export → edit → import round-trips cleanly.
 */
class ImportTemplateController extends Controller
{
    public function __invoke(): StreamedResponse
    {
        abort_unless(auth()->user()->can('administer'), 403);

        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');
            fputcsv($out, ProductExportController::COLUMNS);
            fputcsv($out, [
                'BEV-001', '6001234567890', 'Coca-Cola 500ml', 'Coca-Cola', 'Beverages',
                '1.50', '1.10', 'standard', 'retail', 'yes', '12', '48',
            ]);
            fclose($out);
        }, 'wivae-product-import-template.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
