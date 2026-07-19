<?php

namespace App\Http\Controllers;

use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Switches a tenant between retail and restaurant mode. This is the one
 * control from §1 — "mode is a tenant setting, not a fork" — that had no UI:
 * flipping it previously required tinker. Restaurant mode is what turns on
 * tables, the kitchen queue, and gratuity (Phase 5); this endpoint is the
 * whole mechanism, same admin gate as branding.
 */
class TenantModeController extends Controller
{
    public function update(Request $request, TenantContext $tenant): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate([
            'mode' => ['required', Rule::in(['retail', 'restaurant'])],
        ]);

        $tenant->get()->update(['mode' => $data['mode']]);

        return back()->with('flash', 'Switched to ' . $data['mode'] . ' mode.');
    }
}
