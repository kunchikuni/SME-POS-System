<?php

namespace App\Http\Controllers;

use App\Domain\Tenancy\TenantContext;
use App\Models\KitchenOrder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The kitchen display (KDS). Back-of-house and online-only, so it lives in the
 * dashboard rather than the offline till. It reads the kitchen tickets derived
 * from restaurant sales (SyncService) and advances their status. Tickets are
 * tenant-scoped by the global scope on lookups here — but note that models are
 * resolved explicitly in update(), not via implicit route-model binding; see
 * that method for why.
 *
 * Restaurant-only: retail tenants have no tickets and this surface is hidden.
 */
class KitchenController extends Controller
{
    public function index(TenantContext $tenant): Response
    {
        abort_unless($tenant->get()->isRestaurant(), 404);

        $orders = KitchenOrder::query()
            ->with(['sale.lines:id,sale_id,name,qty', 'table:id,name'])
            ->where('status', '!=', 'served')
            ->orderBy('placed_at')
            ->get()
            ->map(fn (KitchenOrder $o) => [
                'id'        => $o->id,
                'ticket_no' => $o->ticket_no,
                'status'    => $o->status,
                'placed_at' => $o->placed_at?->toIso8601String(),
                'table'     => $o->table?->name,
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

    public function update(Request $request, TenantContext $tenant, string $kitchenOrder): RedirectResponse
    {
        abort_unless($tenant->get()->isRestaurant(), 404);

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
