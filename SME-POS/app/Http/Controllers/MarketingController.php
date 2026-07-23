<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

/**
 * The public landing page (root domain, no tenant in context). Pricing shown
 * here reads from config('paynow.*') directly — the same source the real
 * billing flow (BillingController, Settings > Payments) uses — so marketing
 * copy can never drift out of sync with what a customer is actually charged.
 */
class MarketingController extends Controller
{
    public function home(): Response
    {
        return Inertia::render('Marketing/Home', [
            'plans'          => config('paynow.plans'),
            'hardware'       => config('paynow.hardware'),
            'businessTier'   => config('paynow.business_tier'),
            'enterpriseTier' => config('paynow.enterprise_tier'),
            'zimraAddonPrice' => config('paynow.zimra_addon_price'),
        ]);
    }
}
