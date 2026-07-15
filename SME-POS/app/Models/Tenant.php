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
        'zimra_enabled', 'branding',
    ];

    protected function casts(): array
    {
        return [
            'trial_ends_at' => 'datetime',
            'zimra_enabled' => 'boolean',
            'branding'      => 'array',
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

    /** Theme with the tenant's white-label overrides applied over defaults. */
    public function theme(): array
    {
        return array_merge(config('brand.theme'), $this->branding['theme'] ?? []);
    }
}
