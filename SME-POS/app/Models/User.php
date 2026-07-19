<?php

namespace App\Models;

use App\Domain\Access\Role;
use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * A staff member of a tenant. Owner/Manager authenticate into the dashboard
 * via email + password (Fortify); every role operates the till via a
 * per-device PIN. Cashier/Waiter never get a password at all — till-only,
 * enforced by TenantUserProvider refusing password auth on a NULL hash.
 *
 * Deactivation is a soft-delete, not a destructive one: a cashier with sales
 * history can't be hard-deleted without breaking Sale::cashier_id
 * attribution (same reasoning as Branch — docs/ARCHITECTURE.md §5.2, sales
 * are immutable).
 */
class User extends Authenticatable
{
    use HasUuids, HasFactory, BelongsToTenant, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'branch_id', 'name', 'email', 'password', 'role', 'pin_hash',
    ];

    protected $hidden = ['password', 'pin_hash', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password'          => 'hashed',
            'email_verified_at' => 'datetime',
            'role'              => Role::class,
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /** A fresh 4-digit till PIN. Collision odds are irrelevant — it's scoped per device, attribution not security (§7). */
    public static function generatePin(): string
    {
        return str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    }

    /** A temporary dashboard password an owner can hand to a new manager. */
    public static function generateTempPassword(): string
    {
        return Str::password(12, symbols: false);
    }

    public function setPin(string $pin): void
    {
        $this->pin_hash = Hash::make($pin);
    }
}
