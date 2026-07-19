<?php

namespace App\Http\Controllers;

use App\Domain\Analytics\AiInsightsService;
use Inertia\Inertia;
use Inertia\Response;

class AiInsightsController extends Controller
{
    public function index(AiInsightsService $insights): Response
    {
        return Inertia::render('AiInsights/Index', [
            'reorder'   => $insights->reorderSuggestions(),
            'pricing'   => $insights->pricingFlags(),
            'deadStock' => $insights->deadStock(),
        ]);
    }
}
