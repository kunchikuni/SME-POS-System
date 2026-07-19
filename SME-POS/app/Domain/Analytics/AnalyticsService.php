<?php

namespace App\Domain\Analytics;

use App\Models\Branch;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleLine;
use App\Models\StockLevel;
use Illuminate\Support\Carbon;

/**
 * Read models over the immutable sales ledger and the stock cache. Every query
 * is tenant-scoped: model queries via the BelongsToTenant global scope, and the
 * one join query via `sale_lines.tenant_id` (the scope qualifies its column, so
 * the join is unambiguous and can't leak another tenant's rows — §4/§7).
 *
 * These compute on the fly, which is fine at SME volume. If a tenant ever grows
 * past that, these become cached/materialised without changing the interface.
 */
class AnalyticsService
{
    /** Headline totals for the window. */
    public function overview(Carbon $from, Carbon $to): array
    {
        $agg = Sale::query()
            ->where('status', 'completed')
            ->whereBetween('occurred_at', [$from, $to])
            ->selectRaw('COUNT(*) as sale_count, COALESCE(SUM(total_cents), 0) as revenue_cents')
            ->first();

        $count = (int) ($agg->sale_count ?? 0);
        $revenue = (int) ($agg->revenue_cents ?? 0);

        return [
            'sale_count'     => $count,
            'revenue_cents'  => $revenue,
            'avg_sale_cents' => $count > 0 ? intdiv($revenue, $count) : 0,
        ];
    }

    /** Revenue and sale count per day across the window, zero-filled. */
    public function dailyTrend(Carbon $from, Carbon $to): array
    {
        $rows = Sale::query()
            ->where('status', 'completed')
            ->whereBetween('occurred_at', [$from, $to])
            ->get(['occurred_at', 'total_cents']);

        $byDay = [];
        foreach ($rows as $row) {
            $key = $row->occurred_at->format('Y-m-d');
            $byDay[$key] ??= ['revenue_cents' => 0, 'count' => 0];
            $byDay[$key]['revenue_cents'] += (int) $row->total_cents;
            $byDay[$key]['count']++;
        }

        // Zero-fill every day so the chart has no gaps.
        $out = [];
        for ($cursor = $from->copy()->startOfDay(); $cursor <= $to; $cursor->addDay()) {
            $key = $cursor->format('Y-m-d');
            $out[] = [
                'date'          => $key,
                'revenue_cents' => $byDay[$key]['revenue_cents'] ?? 0,
                'count'         => $byDay[$key]['count'] ?? 0,
            ];
        }

        return $out;
    }

    /** Best sellers by units sold in the window. */
    public function topProducts(Carbon $from, Carbon $to, int $limit = 8): array
    {
        return SaleLine::query()
            ->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->where('sales.status', 'completed')
            ->whereBetween('sales.occurred_at', [$from, $to])
            ->whereNotNull('sale_lines.product_id')
            ->groupBy('sale_lines.product_id', 'sale_lines.name')
            ->selectRaw(
                'sale_lines.product_id as product_id, sale_lines.name as name, '
                . 'SUM(sale_lines.qty) as qty_sold, SUM(sale_lines.line_total_cents) as revenue_cents'
            )
            ->orderByDesc('qty_sold')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => [
                'product_id'    => $r->product_id,
                'name'          => $r->name,
                'qty_sold'      => (int) $r->qty_sold,
                'revenue_cents' => (int) $r->revenue_cents,
            ])
            ->all();
    }

    /**
     * Products that have stock on hand but sold nothing in the window — capital
     * sitting on the shelf. Stock is summed across branches.
     */
    public function deadStock(Carbon $from, Carbon $to): array
    {
        $soldIds = SaleLine::query()
            ->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->where('sales.status', 'completed')
            ->whereBetween('sales.occurred_at', [$from, $to])
            ->whereNotNull('sale_lines.product_id')
            ->distinct()
            ->pluck('sale_lines.product_id')
            ->all();

        $onHand = [];
        foreach (
            StockLevel::query()
                ->selectRaw('product_id, SUM(quantity) as qty')
                ->groupBy('product_id')
                ->get() as $row
        ) {
            if ((int) $row->qty > 0) {
                $onHand[$row->product_id] = (int) $row->qty;
            }
        }

        $deadIds = array_diff(array_keys($onHand), $soldIds);

        return Product::query()
            ->whereIn('id', $deadIds)
            ->where('is_active', true)
            ->get(['id', 'name'])
            ->map(fn (Product $p) => [
                'product_id' => $p->id,
                'name'       => $p->name,
                'quantity'   => $onHand[$p->id],
            ])
            ->sortByDesc('quantity')
            ->values()
            ->all();
    }

    /** Revenue share per category in the window — for a sales-by-category chart. */
    public function categoryBreakdown(Carbon $from, Carbon $to): array
    {
        $rows = SaleLine::query()
            ->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->join('products', 'products.id', '=', 'sale_lines.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->where('sales.status', 'completed')
            ->whereBetween('sales.occurred_at', [$from, $to])
            ->groupBy('categories.id', 'categories.name')
            ->selectRaw(
                'categories.id as category_id, categories.name as name, '
                . 'SUM(sale_lines.line_total_cents) as revenue_cents'
            )
            ->orderByDesc('revenue_cents')
            ->get();

        $total = (int) $rows->sum('revenue_cents');

        return $rows->map(fn ($r) => [
            'category_id'    => $r->category_id,
            'name'           => $r->name ?? 'Uncategorised',
            'revenue_cents'  => (int) $r->revenue_cents,
            'share_percent'  => $total > 0 ? round(($r->revenue_cents / $total) * 100, 1) : 0,
        ])->all();
    }

    /** Revenue and sale count per branch in the window. */
    public function branchPerformance(Carbon $from, Carbon $to): array
    {
        $rows = Sale::query()
            ->where('status', 'completed')
            ->whereBetween('occurred_at', [$from, $to])
            ->groupBy('branch_id')
            ->selectRaw('branch_id, COUNT(*) as sale_count, COALESCE(SUM(total_cents), 0) as revenue_cents')
            ->get();

        $names = Branch::query()->pluck('name', 'id');

        return $rows
            ->map(fn ($r) => [
                'branch_id'     => $r->branch_id,
                'name'          => $names[$r->branch_id] ?? 'Unknown',
                'sale_count'    => (int) $r->sale_count,
                'revenue_cents' => (int) $r->revenue_cents,
            ])
            ->sortByDesc('revenue_cents')
            ->values()
            ->all();
    }
}
