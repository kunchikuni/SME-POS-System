<?php

namespace App\Http\Controllers;

use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * White-label settings (Phase 8 · feat/billing-whitelabel). A tenant overrides
 * the Wivae defaults — name, logo, brand colours — which are stored in the
 * tenant's `branding` JSONB and merged over config/brand.php by Tenant::theme()
 * at request time (docs/ARCHITECTURE.md §8). No new mechanism; this is the UI.
 *
 * Admin-only: branding is an owner/manager concern.
 */
class BrandingController extends Controller
{
    public function edit(TenantContext $tenant): Response
    {
        abort_unless(Gate::allows('administer'), 403);

        $t = $tenant->get();
        $theme = $t->theme();

        return Inertia::render('Settings/Branding', [
            'branding' => [
                'name'     => $t->name,
                'subdomain' => $t->subdomain,
                'primary'  => $theme['primary'] ?? '#1D4ED8',
                'accent'   => $theme['accent'] ?? '#059669',
                'logo_url' => $theme['logo_url'] ?? null,
            ],
            'tenantDomain' => config('brand.tenant_domain'),
        ]);
    }

    public function update(Request $request, TenantContext $tenant): RedirectResponse
    {
        abort_unless(Gate::allows('administer'), 403);

        $validated = $request->validate([
            'name'     => ['required', 'string', 'max:100'],
            'primary'  => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'accent'   => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'logo_url' => ['nullable', 'url', 'max:2048'],
        ]);

        $t = $tenant->get();

        $branding = $t->branding ?? [];
        $branding['theme'] = array_merge($branding['theme'] ?? [], [
            'primary'  => $validated['primary'],
            'accent'   => $validated['accent'],
            'logo_url' => $validated['logo_url'] ?? null,
        ]);

        $t->name = $validated['name'];
        $t->branding = $branding;
        $t->save();

        return back()->with('flash', 'Branding updated.');
    }
}
