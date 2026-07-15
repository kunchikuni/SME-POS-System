<?php

namespace App\Domain\Tenancy;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Applied to every tenant-owned model.
 *
 * - Adds a global scope so all reads are automatically filtered to the
 *   current tenant. A missing `where('tenant_id', …)` cannot leak another
 *   tenant's data because the query never sees it.
 * - Auto-fills `tenant_id` on create from the current TenantContext.
 *
 * See docs/ARCHITECTURE.md §4.
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new class implements Scope {
            public function apply(Builder $builder, Model $model): void
            {
                $tenantId = app(TenantContext::class)->id();

                // No tenant in context (e.g. central/onboarding routes): do
                // not silently return every tenant's rows. Force an empty set.
                $builder->where(
                    $model->getTable() . '.tenant_id',
                    $tenantId ?? '00000000-0000-0000-0000-000000000000'
                );
            }
        });

        static::creating(function (Model $model): void {
            if (empty($model->tenant_id)) {
                $model->tenant_id = app(TenantContext::class)->id();
            }
        });
    }
}
