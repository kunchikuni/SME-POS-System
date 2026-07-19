<?php

namespace App\Domain\Inventory;

use App\Models\Product;

/**
 * Read models for the inventory dashboard. Tenant scoping comes from the
 * BelongsToTenant global scope on Product/StockLevel, so nothing here can read
 * across tenants (docs/ARCHITECTURE.md §4).
 *
 * On-hand quantities are summed from `stock_levels` — the cache over the
 * movement ledger — not stored on the product, so these figures always agree
 * with the ledger (§5.1).
 */
class InventoryService
{
    /**
     * Headline numbers for the inventory screen.
     *
     * Valuation uses cost where captured and falls back to sell price, so a
     * merchant who hasn't entered costs still sees a meaningful figure rather
     * than zero.
     */
    public function summary(): array
    {
        $products = Product::query()
            ->where('is_active', true)
            ->withSum('stockLevels as on_hand', 'quantity')
            ->get(['id', 'price_cents', 'cost_cents', 'track_stock', 'low_stock_threshold']);

        $valuationCents = 0;
        $lowStock = 0;

        foreach ($products as $product) {
            $onHand = (int) ($product->on_hand ?? 0);

            if ($product->track_stock) {
                $valuationCents += max(0, $onHand) * $product->valuationCents();

                // A threshold of 0 means "tell me when it runs out".
                if ($onHand <= $product->low_stock_threshold) {
                    $lowStock++;
                }
            }
        }

        return [
            'total_products'  => $products->count(),
            'low_stock'       => $lowStock,
            'valuation_cents' => $valuationCents,
        ];
    }
}
