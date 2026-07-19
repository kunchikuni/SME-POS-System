<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The financial ledger (item 4), distinct from Orders: Orders answers "what
 * did we sell and who rang it up"; Transactions answers "how did the money
 * come in" — a breakdown by tender method plus the raw payment records. Every
 * payment here is a label the merchant chose at checkout, never money Wivae
 * processed (docs §1, §9.1).
 */
class TransactionsController extends Controller
{
    public function index(Request $request): Response
    {
        $days = (int) $request->integer('days', 7);
        if (! in_array($days, [1, 7, 30], true)) {
            $days = 7;
        }

        $from = now()->subDays($days);

        $byMethod = Payment::query()
            ->whereHas('sale', fn ($q) => $q->where('status', 'completed')->where('occurred_at', '>=', $from))
            ->groupBy('method')
            ->selectRaw('method, COUNT(*) as count, SUM(amount_cents) as total_cents')
            ->orderByDesc('total_cents')
            ->get();

        $ledger = Payment::query()
            ->with(['sale:id,occurred_at,cashier_id', 'sale.cashier:id,name'])
            ->whereHas('sale', fn ($q) => $q->where('status', 'completed')->where('occurred_at', '>=', $from))
            ->orderByDesc('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (Payment $p) => [
                'id'          => $p->id,
                'method'      => $p->method,
                'amount_cents' => $p->amount_cents,
                'currency'    => $p->currency,
                'occurred_at' => $p->sale?->occurred_at?->toIso8601String(),
                'cashier'     => $p->sale?->cashier?->name ?? 'Unknown',
                'sale_id'     => $p->sale_id,
            ]);

        return Inertia::render('Transactions/Index', [
            'byMethod' => $byMethod,
            'ledger'   => $ledger,
            'days'     => $days,
        ]);
    }
}
