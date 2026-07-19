<?php

namespace App\Domain\Analytics;

use App\Models\Product;
use App\Models\SaleLine;
use App\Models\StockLevel;
use Illuminate\Support\Carbon;

/**
 * Inventory and pricing insights (item 5). These are RULE-BASED, computed
 * directly from real sales velocity, stock levels, and margin — not narrative
 * text from a language model. That distinction is stated on the page itself,
 * not just in this comment: showing AI-sounding copy without an actual model
 * behind it would be a fabrication the merchant can't tell apart from a real
 * recommendation, and this codebase does not do that (docs/ARCHITECTURE.md —
 * "believe search results" / accuracy discipline extends to in-app claims).
 *
 * A narrative layer (calling an LLM to turn these numbers into prose) is a
 * legitimate future upgrade — AiNarrativeService is the seam for it — but it
 * requires a configured API key and its own cost/latency tradeoffs, so it's
 * deliberately not wired in here.
 */
class AiInsightsService
{
    public function __construct(private AnalyticsService $analytics) {}

    /**
     * Products low on shelf that are still selling — the reorder list, most
     * urgent first. "Urgent" = fewest estimated days of stock left, from a
     * 30-day sales velocity. A product with no recent sales isn't urgent to
     * reorder (see deadStock() instead) even if it's technically low.
     */
    public function reorderSuggestions(int $limit = 10): array
    {
        $from = now()->subDays(30)->startOfDay();
        $to = now();

        $velocity = SaleLine::query()
            ->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->where('sales.status', 'completed')
            ->whereBetween('sales.occurred_at', [$from, $to])
            ->whereNotNull('sale_lines.product_id')
            ->groupBy('sale_lines.product_id')
            ->selectRaw('sale_lines.product_id as product_id, SUM(sale_lines.qty) as qty_30d')
            ->pluck('qty_30d', 'product_id');

        $onHand = StockLevel::query()
            ->selectRaw('product_id, SUM(quantity) as qty')
            ->groupBy('product_id')
            ->pluck('qty', 'product_id');

        return Product::query()
            ->where('is_active', true)
            ->where('track_stock', true)
            ->get(['id', 'name', 'low_stock_threshold'])
            ->map(function (Product $p) use ($velocity, $onHand) {
                $stock = (int) ($onHand[$p->id] ?? 0);
                $sold30d = (int) ($velocity[$p->id] ?? 0);
                $dailyRate = $sold30d / 30;
                $daysLeft = $dailyRate > 0 ? $stock / $dailyRate : null;

                return [
                    'product_id'   => $p->id,
                    'name'         => $p->name,
                    'on_hand'      => $stock,
                    'threshold'    => $p->low_stock_threshold,
                    'sold_30d'     => $sold30d,
                    'days_left'    => $daysLeft !== null ? round($daysLeft, 1) : null,
                    'low'          => $stock <= $p->low_stock_threshold,
                ];
            })
            ->filter(fn ($row) => $row['low'] && $row['sold_30d'] > 0)
            ->sortBy('days_left')
            ->values()
            ->take($limit)
            ->all();
    }

    /**
     * Products whose margin looks worth a second look, based on sales in the
     * last 30 days. Only products with both a cost and at least one sale are
     * considered — no cost captured means no honest margin to flag.
     */
    public function pricingFlags(int $limit = 10): array
    {
        $from = now()->subDays(30)->startOfDay();
        $to = now();

        $sold = $this->analytics->topProducts($from, $to, 200); // wide net; we filter below
        $soldByProduct = collect($sold)->keyBy('product_id');

        return Product::query()
            ->where('is_active', true)
            ->whereNotNull('cost_cents')
            ->whereIn('id', $soldByProduct->keys())
            ->get(['id', 'name', 'price_cents', 'cost_cents'])
            ->map(function (Product $p) use ($soldByProduct) {
                $margin = $p->marginPercent();
                $sold = $soldByProduct[$p->id];

                $flag = null;
                if ($margin !== null && $margin < 20) {
                    $flag = 'low_margin';
                } elseif ($margin !== null && $margin > 50 && $sold['qty_sold'] >= 10) {
                    $flag = 'strong_margin';
                }

                return [
                    'product_id'    => $p->id,
                    'name'          => $p->name,
                    'margin_percent' => $margin,
                    'qty_sold_30d'  => $sold['qty_sold'],
                    'flag'          => $flag,
                ];
            })
            ->filter(fn ($row) => $row['flag'] !== null)
            ->sortBy('margin_percent')
            ->values()
            ->take($limit)
            ->all();
    }

    /** Reuses the same read model Analytics uses — one definition of dead stock. */
    public function deadStock(int $days = 30): array
    {
        return $this->analytics->deadStock(now()->subDays($days)->startOfDay(), now());
    }
}
