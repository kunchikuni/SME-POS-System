<?php

namespace App\Domain\Fiscalisation;

use App\Models\FiscalDevice;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * ZIMRA FDMS integration (Phase 7). Built against the ACTUAL Fiscal Device
 * Gateway API Specification v7.2, fetched directly from zimra.co.zw — not
 * reconstructed from memory (docs/ARCHITECTURE.md §9.2 records why that
 * distinction matters here specifically).
 *
 * WHAT'S REAL: verifyTaxpayerInformation below. It's the one FDMS endpoint
 * that's public (no client certificate required) and read-only, so it's safe
 * to wire before anything else — it lets an owner confirm their Device
 * ID/Activation Key/Serial actually resolve to their real ZIMRA taxpayer
 * record, with zero risk, before any signing or registration happens.
 *
 * WHAT'S DELIBERATELY NOT BUILT YET, and why each one is a real blocker:
 *
 *   registerDevice — needs a CSR (Certificate Signing Request) generated with
 *   a ZIMRA-specified Common Name format and ECDSA P-256 or RSA 2048 keys.
 *   PHP's openssl_csr_new can do this, but the exact CN format
 *   (ZIMRA-<serial>-<10-digit-zero-padded-deviceId>) and subject fields must
 *   be byte-perfect or FDMS rejects the CSR outright.
 *
 *   submitReceipt — every receipt needs a device signature: a SHA-256 hash of
 *   specific receipt fields, signed with the device's own private key, per an
 *   algorithm described in spec §13 that wasn't fully captured in the portion
 *   fetched. Implementing this from an incomplete read of the algorithm is
 *   exactly the kind of thing that fails silently — a receipt that looks
 *   fine locally but never validates at FDMS.
 *
 *   openDay/closeDay — a real state machine with strict sequential counters
 *   (receiptGlobalNo must never skip or reorder) that needs to be tested
 *   against the live test environment to trust, not simulated.
 *
 * All three need ZIMRA test-environment credentials to build against safely
 * — verify_taxpayer_information's exact endpoint path is also unconfirmed
 * (see config/fiscalisation.php) and this method is written to surface FDMS's
 * real response/error rather than pretend success either way.
 */
class FiscalisationService
{
    public function verifyTaxpayer(FiscalDevice $device): array
    {
        if ($device->zimra_device_id === null || $device->activation_key === null || $device->device_serial_no === null) {
            return ['ok' => false, 'message' => 'Device ID, Activation Key, and Serial Number are all required.'];
        }

        $env = $device->environment === 'production' ? 'production' : 'test';
        $baseUrl = config("fiscalisation.{$env}.base_url");
        $path = config('fiscalisation.paths.verify_taxpayer_information');

        try {
            $response = Http::withHeaders([
                'DeviceModelName'       => $device->device_model_name,
                'DeviceModelVersionNo'  => $device->device_model_version,
            ])
                ->timeout(30) // spec §7.4: 30s is FDMS's own synchronous timeout
                ->post("{$baseUrl}{$path}", [
                    'deviceID'      => (int) $device->zimra_device_id,
                    'activationKey' => $device->activation_key,
                    'deviceSerialNo' => $device->device_serial_no,
                ]);
        } catch (ConnectionException $e) {
            return ['ok' => false, 'message' => 'Could not reach ZIMRA FDMS. Check your connection and try again.'];
        }

        if ($response->failed()) {
            return [
                'ok'      => false,
                'message' => "ZIMRA returned HTTP {$response->status()}.",
                'detail'  => $response->json() ?? $response->body(),
            ];
        }

        $data = $response->json();

        $device->update([
            'taxpayer_name'          => $data['taxPayerName'] ?? null,
            'taxpayer_tin'           => $data['taxPayerTIN'] ?? null,
            'vat_number'             => $data['vatNumber'] ?? null,
            'device_branch_name'     => $data['deviceBranchName'] ?? null,
            'device_branch_address'  => $data['deviceBranchAddress'] ?? null,
            'verified_at'            => now(),
        ]);

        return ['ok' => true, 'data' => $data];
    }
}
