<?php

namespace App\Domain\Tenancy;

use App\Domain\Access\Role;
use App\Models\Branch;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Provisions a new merchant end to end: tenant, owner account, a default
 * branch, a trialing subscription, and the trial window. One transaction —
 * a half-created tenant is worse than none.
 *
 * This is the only place tenant creation happens, so onboarding stays a
 * single reviewable unit rather than logic smeared across a controller.
 */
class RegisterTenant
{
    /**
     * @return array{tenant: Tenant, owner: User}
     */
    public function handle(
        string $businessName,
        string $subdomain,
        string $ownerName,
        string $ownerEmail,
        string $password,
    ): array {
        return DB::transaction(function () use (
            $businessName, $subdomain, $ownerName, $ownerEmail, $password
        ) {
            $tenant = Tenant::create([
                'name'          => $businessName,
                'subdomain'     => $subdomain,
                'plan'          => 'trial',
                'status'        => 'active',
                'trial_ends_at' => now()->addDays(config('brand.trial_days')),
            ]);

            $branch = Branch::create([
                'tenant_id'  => $tenant->id,
                'name'       => 'Main Branch',
                'is_default' => true,
            ]);

            $owner = User::create([
                'tenant_id' => $tenant->id,
                'branch_id' => $branch->id,
                'name'      => $ownerName,
                'email'     => $ownerEmail,
                'password'  => $password, // hashed by cast
                'role'      => Role::Owner,
            ]);

            Subscription::create([
                'tenant_id'          => $tenant->id,
                'plan'               => 'byod',
                'status'             => 'trialing',
                'current_period_end' => $tenant->trial_ends_at,
            ]);

            return ['tenant' => $tenant, 'owner' => $owner];
        });
    }
}
