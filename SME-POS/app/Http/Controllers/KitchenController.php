<?php

namespace App\Http\Controllers;

use App\Models\KitchenOrder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The kitchen display (KDS). Back-of-house and online-only, so it lives in the
 * dashboard rather than the offline till. It reads the kitchen tickets derived
 * from sales that explicitly routed to the kitchen (SyncService §route_to_kitchen)
 * and advances their status. Tickets are tenant-scoped by the global scope on
 * lookups here — but note that models are resolved explicitly in update(), not
 * via implicit route-model binding; see that method for why.
 *
 * Not gated by any branch's mode: even a branch currently set to retail may
 * have existing tickets from before it was switched, or a restaurant-mode
 * branch's tickets shouldn't vanish if it's later switched to retail — so
 * this stays reachable regardless of what any branch defaults to. A tenant
 * with no routed sales just sees an empty "no open tickets" state.
 */
class KitchenController extends Controller
{
    public function index(): Response
    {
        $orders = KitchenOrder::query()
            ->with(['sale.lines:id,sale_id,name,qty', 'table:id,name', 'branch:id,name'])
            ->where('status', '!=', 'served')
            ->orderBy('placed_at')
            ->get()
            ->map(fn (KitchenOrder $o) => [
                'id'        => $o->id,
                'ticket_no' => $o->ticket_no,
                'status'    => $o->status,
                'placed_at' => $o->placed_at?->toIso8601String(),
                'table'     => $o->table?->name,
                'branch'    => $o->branch?->name,
                // Not a fabricated field: a ticket with no table genuinely is
                // a counter order — there's no separate "channel" concept,
                // this is table_id's real meaning.
                'channel'   => $o->table_id === null ? 'counter' : 'dine_in',
                'items'     => $o->sale?->lines->map(fn ($l) => [
                    'name' => $l->name,
                    'qty'  => $l->qty,
                ]) ?? [],
            ]);

        return Inertia::render('Kitchen/Index', ['orders' => $orders]);
    }

    public function update(Request $request, string $kitchenOrder): RedirectResponse
    {
        // Resolved explicitly, not via implicit binding: route-model binding
        // runs as route middleware, which can execute before ResolveTenant has
        // set the tenant context — the tenant scope then matches nothing and
        // binding 404s. Not the cross-tenant leak the old docblock here
        // assumed; the scope was doing its job, just too early to see it.
        $order = KitchenOrder::findOrFail($kitchenOrder);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['preparing', 'ready', 'served'])],
        ]);

        $order->status = $validated['status'];
        if ($validated['status'] === 'ready' && $order->ready_at === null) {
            $order->ready_at = now();
        }
        $order->save();

        return back();
    }
}
