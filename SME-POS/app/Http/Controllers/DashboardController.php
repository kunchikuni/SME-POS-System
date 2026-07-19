<?php

namespace App\Http\Controllers;

use App\Domain\Analytics\AnalyticsService;
use App\Domain\Tenancy\TenantContext;
use App\Models\Device;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The vendor dashboard home. Every number here is real — no placeholder KPIs —
 * because a merchant checking their revenue is the one screen where a fake
 * number is actively harmful. "Getting Started" reflects genuine account state
 * (has a product been added? has a sale been made?) so it clears itself
 * honestly as the merchant actually does those things, rather than needing to
 * be dismissed.
 */
class DashboardController extends Controller
{
    public function index(TenantContext $tenant, AnalyticsService $analytics): Response
    {
        $today = now()->startOfDay();
        $todayOverview = $analytics->overview($today, now());

        $trend = $analytics->dailyTrend(now()->subDays(6)->startOfDay(), now());
        $categories = $analytics->categoryBreakdown(now()->subDays(30)->startOfDay(), now());

        return Inertia::render('Dashboard/Index', [
            'kpis' => [
                'revenueTodayCents' => $todayOverview['revenue_cents'],
                'ordersToday'       => $todayOverview['sale_count'],
                'totalProducts'     => Product::where('is_active', true)->count(),
                'activeStaff'       => User::count(),
            ],
            'gettingStarted' => [
                'hasProduct'       => Product::query()->exists(),
                'hasSale'          => Sale::where('status', 'completed')->exists(),
                'hasPaymentSetup'  => false, // Paynow wiring lands in Phase 8 billing
                'hasFiscal'        => (bool) $tenant->get()->zimra_enabled,
            ],
            'trend'      => $trend,
            'categories' => $categories,
            'deviceCount' => Device::count(),
        ]);
    }
}
