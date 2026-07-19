<?php

namespace App\Http\Middleware;

use App\Domain\Pos\DeviceContext;
use App\Domain\Tenancy\TenantContext;
use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates a POS API request by its bearer token and binds both the
 * tenant and the device/branch into context. The token — not the subdomain —
 * is authoritative, so sync works identically online or on reconnect.
 *
 * Stateless: no session, no CSRF (those routes are excepted in bootstrap/app).
 */
class ResolveDevice
{
    public function __construct(
        private TenantContext $tenants,
        private DeviceContext $devices,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if ($token === null) {
            return response()->json(['message' => 'Missing device token.'], 401);
        }

        $device = Device::withoutGlobalScopes()
            ->with('tenant', 'branch')
            ->where('token_hash', Device::hashToken($token))
            ->first();

        if ($device === null || $device->tenant === null) {
            return response()->json(['message' => 'Invalid device token.'], 401);
        }

        $this->tenants->set($device->tenant);
        $this->devices->set($device);

        // Touch last_seen without tripping updated_at churn on every request.
        $device->forceFill(['last_seen_at' => now()])->saveQuietly();

        // {tenant} is a domain wildcard sitting in the matched route's
        // parameter bag. Left there, it can leak into a scalar-typed
        // controller argument on routes with only one other parameter (e.g.
        // `complete(Request $request, string $task)` receiving the tenant
        // subdomain instead of the task UUID from {task}). See ResolveTenant
        // for the full explanation — same bug, same fix, different middleware
        // because the POS API uses bearer-token auth instead of session auth.
        $request->route()?->forgetParameter('tenant');

        return $next($request);
    }
}
