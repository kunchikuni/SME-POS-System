<?php

namespace App\Http\Controllers;

use App\Domain\Fiscalisation\FiscalisationService;
use App\Domain\Tenancy\TenantContext;
use App\Models\FiscalDevice;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * ZIMRA Fiscalisation config screen. See FiscalisationService for exactly
 * what's real (verifyTaxpayer, against the actual spec) vs. deliberately not
 * built yet (device registration, receipt signing, fiscal day open/close).
 */
class FiscalisationController extends Controller
{
    public function edit(TenantContext $tenant): Response
    {
        $device = FiscalDevice::firstOrNew([]);

        return Inertia::render('Settings/Fiscalisation', [
            'enabled' => (bool) $tenant->get()->zimra_enabled,
            'device'  => [
                'zimra_device_id'      => $device->zimra_device_id,
                'device_serial_no'     => $device->device_serial_no,
                'device_model_name'    => $device->device_model_name ?? 'Wivae POS',
                'device_model_version' => $device->device_model_version ?? '1.0',
                'environment'          => $device->environment ?? 'test',
                'has_activation_key'   => $device->activation_key !== null,
                'taxpayer_name'        => $device->taxpayer_name,
                'taxpayer_tin'         => $device->taxpayer_tin,
                'vat_number'           => $device->vat_number,
                'device_branch_name'   => $device->device_branch_name,
                'verified_at'          => $device->verified_at?->toIso8601String(),
                'is_registered'        => $device->isRegistered(),
                'fiscal_day_status'    => $device->fiscal_day_status ?? 'not_registered',
            ],
        ]);
    }

    public function toggle(Request $request, TenantContext $tenant): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        $tenant->get()->update(['zimra_enabled' => $data['enabled']]);

        return back()->with('flash', $data['enabled'] ? 'Fiscalisation enabled.' : 'Fiscalisation disabled.');
    }

    public function saveDevice(Request $request): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate([
            'zimra_device_id'      => ['required', 'integer'],
            'activation_key'       => ['required', 'string', 'size:8'],
            'device_serial_no'     => ['required', 'string', 'max:20'],
            'device_model_name'    => ['required', 'string', 'max:100'],
            'device_model_version' => ['required', 'string', 'max:20'],
            'environment'          => ['required', 'in:test,production'],
        ]);

        // Changing credentials invalidates any prior verification — force a
        // re-check rather than keep stale taxpayer data attached to new keys.
        $device = FiscalDevice::firstOrNew([]);
        $device->fill($data);
        $device->verified_at = null;
        $device->save();

        return back()->with('flash', 'Device credentials saved. Click Verify to confirm them with ZIMRA.');
    }

    public function verify(FiscalisationService $service): RedirectResponse
    {
        abort_unless(request()->user()->can('administer'), 403);

        $device = FiscalDevice::firstOrNew([]);
        $result = $service->verifyTaxpayer($device);

        return back()->with(
            'flash',
            $result['ok']
                ? "Verified: {$result['data']['taxPayerName']} (TIN {$result['data']['taxPayerTIN']})"
                : ($result['message'] . (isset($result['detail']) ? ' ' . json_encode($result['detail']) : '')),
        );
    }
}
