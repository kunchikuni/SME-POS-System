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
 * tenant-scoped by the global scope; route-model binding can't cross tenants.
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
                'status'    => $o->status,
                'placed_at' => $o->placed_at?->toIso8601String(),
                'table'     => $o->table?->name,
                'items'     => $o->sale?->lines->map(fn ($l) => [
                        'name' => $l->name,
                        'qty'  => $l->qty,
                    ]) ?? [],
            ]);

        return Inertia::render('Kitchen/Index', ['orders' => $orders]);
    }

    public function update(Request $request, TenantContext $tenant, KitchenOrder $kitchenOrder): RedirectResponse
    {
        abort_unless($tenant->get()->isRestaurant(), 404);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['preparing', 'ready', 'served'])],
        ]);

        $kitchenOrder->status = $validated['status'];
        if ($validated['status'] === 'ready' && $kitchenOrder->ready_at === null) {
            $kitchenOrder->ready_at = now();
        }
        $kitchenOrder->save();

        return back();
    }
}
