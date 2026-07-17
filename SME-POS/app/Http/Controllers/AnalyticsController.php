<?php

namespace App\Http\Controllers;

use App\Domain\Analytics\AnalyticsService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The analytics dashboard (Phase 6 · feat/analytics). Online, server-driven
 * back-office — it reads the sales ledger and stock cache and renders one page.
 * The heavy lifting lives in AnalyticsService; this just picks the window.
 */
class AnalyticsController extends Controller
{
    public function index(Request $request, AnalyticsService $analytics): Response
    {
        $days = (int) $request->integer('days', 30);
        if (! in_array($days, [7, 30, 90], true)) {
            $days = 30;
        }

        $to = now();
        $from = now()->subDays($days)->startOfDay();

        return Inertia::render('Analytics/Index', [
            'days'        => $days,
            'overview'    => $analytics->overview($from, $to),
            'trend'       => $analytics->dailyTrend($from, $to),
            'topProducts' => $analytics->topProducts($from, $to),
            'deadStock'   => $analytics->deadStock($from, $to),
            'branches'    => $analytics->branchPerformance($from, $to),
        ]);
    }
}
