<?php

namespace App\Http\Controllers;

use App\Models\Sale;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The operational sales list (item 2/4): what was sold, by whom, and — in
 * restaurant mode — at which table. This is what makes cashier attribution
 * visible to an owner; `Sale::cashier_id` has carried this since Phase 3, it
 * just had no screen. Read-only: sales are immutable (docs §5.2).
 */
class OrdersController extends Controller
{
    public function index(Request $request): Response
    {
        $days = (int) $request->integer('days', 7);
        if (! in_array($days, [1, 7, 30], true)) {
            $days = 7;
        }

        $sales = Sale::query()
            ->with(['cashier:id,name', 'table:id,name', 'payments', 'lines:id,sale_id,name,qty'])
            ->where('status', 'completed')
            ->where('occurred_at', '>=', now()->subDays($days))
            ->orderByDesc('occurred_at')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (Sale $s) => [
                'id'          => $s->id,
                'occurred_at' => $s->occurred_at->toIso8601String(),
                'cashier'     => $s->cashier?->name ?? 'Unknown',
                'table'       => $s->table?->name,
                'item_count'  => $s->lines->sum('qty'),
                'items'       => $s->lines->map(fn ($l) => "{$l->qty}× {$l->name}")->implode(', '),
                'methods'     => $s->payments->pluck('method')->unique()->values(),
                'total_cents' => $s->total_cents,
                'currency'    => $s->currency,
            ]);

        return Inertia::render('Orders/Index', [
            'sales' => $sales,
            'days'  => $days,
        ]);
    }
}
