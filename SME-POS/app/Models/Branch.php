<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A physical location belonging to a tenant. `mode` (retail | restaurant) is
 * the authoritative source for what tills at this branch open to and
 * whether kitchen tickets get created by default — moved here from
 * Tenant::mode so two branches of the same tenant can genuinely be
 * different business types, permanently, without a tenant-wide toggle
 * flipping every location at once. See the 2026_01_13_000002 migration.
 */
class Branch extends Model
{
    use HasUuids, HasFactory, BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'address', 'manager_id', 'phone', 'is_active', 'is_default', 'mode'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'is_active' => 'boolean'];
    }

    public function isRestaurant(): bool
    {
        return $this->mode === 'restaurant';
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    /** Staff assigned to this branch (User::branch_id, not a pivot). */
    public function staff(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }
}
