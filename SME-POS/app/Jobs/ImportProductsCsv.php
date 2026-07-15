<?php

namespace App\Jobs;

use App\Domain\Inventory\StockReason;
use App\Domain\Inventory\StockService;
use App\Domain\Tenancy\InteractsWithTenant;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

/**
 * Bulk product import. Runs off the request cycle (Horizon) because a large
 * catalogue shouldn't block a web response.
 *
 * Expected columns (header row, case-insensitive):
 *   sku, name, price, barcode, category, initial_qty
 *
 * Idempotent per row: updateOrCreate on (tenant_id, sku) means re-running an
 * import edits rather than duplicates. Initial quantity is written through the
 * ledger, not stamped on the product.
 */
class ImportProductsCsv implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, InteractsWithTenant;

    public function __construct(
        string $tenantId,
        public string $path,        // temp storage path of the uploaded CSV
        public string $branchId,    // where initial stock lands
    ) {
        $this->tenantId = $tenantId;
    }

    public function handle(StockService $stock): void
    {
        $this->bindTenant();

        $handle = fopen(Storage::path($this->path), 'r');
        if ($handle === false) {
            return;
        }

        $header = array_map(
            fn ($h) => strtolower(trim($h)),
            fgetcsv($handle) ?: []
        );

        while (($row = fgetcsv($handle)) !== false) {
            $data = array_combine($header, $row);
            if (! $data || empty($data['sku']) || empty($data['name'])) {
                continue; // skip blank / malformed rows rather than fail the batch
            }

            $categoryId = ! empty($data['category'])
                ? Category::firstOrCreate(['name' => trim($data['category'])])->id
                : null;

            $product = Product::updateOrCreate(
                ['sku' => trim($data['sku'])],
                [
                    'name'        => trim($data['name']),
                    'barcode'     => $data['barcode'] ?? null,
                    'category_id' => $categoryId,
                    'price_cents' => (int) round(((float) ($data['price'] ?? 0)) * 100),
                    'type'        => 'retail',
                    'track_stock' => true,
                ],
            );

            $qty = (int) ($data['initial_qty'] ?? 0);
            if ($qty > 0 && $product->wasRecentlyCreated) {
                $stock->record($product, $this->branchId, $qty, StockReason::Initial);
            }
        }

        fclose($handle);
        Storage::delete($this->path);
    }
}
