<?php

namespace App\Http\Controllers\Pos;

use App\Domain\Pos\DeviceContext;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Lightweight session probe. The PWA calls this once when online to confirm its
 * token is valid and to fetch branch + branding. Cashier PIN login happens
 * client-side against the staff PIN hashes delivered in bootstrap, so it works
 * offline — this endpoint is not on the offline hot path.
 */
class PosController extends Controller
{
    public function session(DeviceContext $device, TenantContext $tenant): JsonResponse
    {
        $d = $device->get();

        return response()->json([
            'device' => ['id' => $d->id, 'name' => $d->name],
            'branch' => ['id' => $d->branch_id, 'name' => $d->branch?->name],
            'tenant' => [
                'name'        => $tenant->get()->name,
                'theme'       => $tenant->get()->theme(),
                'mode'        => $tenant->get()->mode ?? 'retail',
                'currency'    => $tenant->get()->currency ?? 'USD',
                'taxRateBps'  => $tenant->get()->taxRateBasisPoints(),
            ],
        ]);
    }
}
