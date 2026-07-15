<?php

namespace App\Domain\Tenancy;

use App\Models\Tenant;

/**
 * Holds the tenant resolved for the current request.
 *
 * Bound as a singleton per request by ResolveTenant middleware. Every
 * tenant-scoped query and every created row reads the current tenant from
 * here (via the BelongsToTenant trait), so tenant isolation is structural
 * rather than something each query has to remember.
 */
class TenantContext
{
    private ?Tenant $tenant = null;

    public function set(Tenant $tenant): void
    {
        $this->tenant = $tenant;
    }

    public function get(): ?Tenant
    {
        return $this->tenant;
    }

    public function id(): ?string
    {
        return $this->tenant?->id;
    }

    public function has(): bool
    {
        return $this->tenant !== null;
    }
}
