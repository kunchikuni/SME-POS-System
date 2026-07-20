<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A merchant. The root of the tenancy tree — Tenant itself is NOT
 * tenant-scoped (it has no tenant_id and no BelongsToTenant trait).
 */
class Tenant extends Model
{
    use HasUuids, HasFactory;

    protected $fillable = [
        'name', 'subdomain', 'plan', 'status', 'trial_ends_at',
        'zimra_enabled', 'branding', 'mode', 'currency', 'tax_rate_bps',
        'nssa_rate_bps', 'nssa_ceiling_cents',
    ];

    protected function casts(): array
    {
        return [
            'trial_ends_at' => 'datetime',
            'zimra_enabled' => 'boolean',
            'branding'      => 'array',
            'tax_rate_bps'  => 'integer',
            'nssa_rate_bps' => 'integer',
            'nssa_ceiling_cents' => 'integer',
        ];
    }

    public function staff(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    public function subscription()
    {
        return $this->hasOne(Subscription::class)->latestOfMany();
    }

    public function onTrial(): bool
    {
        return $this->trial_ends_at !== null && $this->trial_ends_at->isFuture();
    }

    /** Restaurant tenants get tables, the kitchen queue, and gratuity (§Phase 5). */
    /** VAT rate for standard-rated products, in basis points (1500 = 15%). */
    public function taxRateBasisPoints(): int
    {
        return $this->tax_rate_bps ?? 0;
    }

    public function isRestaurant(): bool
    {
        return $this->mode === 'restaurant';
    }

    /** Theme with the tenant's white-label overrides applied over defaults. */
    public function theme(): array
    {
        return array_merge(config('brand.theme'), $this->branding['theme'] ?? []);
    }
}
