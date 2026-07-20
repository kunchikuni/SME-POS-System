<?php

namespace App\Http\Controllers;

use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * General store settings: display currency and the VAT rate that flows to
 * every till on next sync (item 6). This is the one control surface for the
 * inclusive-VAT decision in docs/ARCHITECTURE.md §3 — the rate configured
 * here is exactly what pos/src/lib/tax.ts backs out of shelf prices.
 */
class SettingsController extends Controller
{
    private const CURRENCIES = ['USD', 'ZWL', 'ZAR'];

    public function edit(TenantContext $tenant): Response
    {
        $t = $tenant->get();

        return Inertia::render('Settings/General', [
            'name'        => $t->name,
            'currency'    => $t->currency ?? 'USD',
            'taxRatePercent' => $t->taxRateBasisPoints() / 100,
            'currencies'  => self::CURRENCIES,
            'mode'        => $t->mode ?? 'retail',
        ]);
    }

    public function update(Request $request, TenantContext $tenant): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate([
            'name'            => ['required', 'string', 'max:100'],
            'currency'        => ['required', Rule::in(self::CURRENCIES)],
            'taxRatePercent'  => ['required', 'numeric', 'min:0', 'max:100'],
        ]);

        $tenant->get()->update([
            'name'         => $data['name'],
            'currency'     => $data['currency'],
            // Percent -> basis points, e.g. 15.5 -> 1550. Integer, like every
            // other money-adjacent figure in the system (docs §3).
            'tax_rate_bps' => (int) round($data['taxRatePercent'] * 100),
        ]);

        return back()->with('flash', 'Settings updated.');
    }
}
