<?php

namespace App\Domain\Tenancy;

use App\Models\Tenant;

/**
 * For queued jobs. A worker runs outside the HTTP request, so there is no
 * tenant in context — the global scope would filter to nothing (or, worse,
 * the wrong tenant left over from a previous job). A tenant-aware job stores
 * the tenant id and rebinds context before doing any tenant work.
 *
 * Phase 3's sync jobs use this same trait.
 */
trait InteractsWithTenant
{
    public string $tenantId;

    public function forTenant(string $tenantId): static
    {
        $this->tenantId = $tenantId;

        return $this;
    }

    protected function bindTenant(): Tenant
    {
        $tenant = Tenant::withoutGlobalScopes()->findOrFail($this->tenantId);
        app(TenantContext::class)->set($tenant);

        return $tenant;
    }
}
