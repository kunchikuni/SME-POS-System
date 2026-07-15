<?php

namespace App\Models;

use App\Domain\Access\Role;
use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * A staff member of a tenant. Authenticates into the dashboard via
 * email + password (Fortify); operates the till via a per-device PIN.
 */
class User extends Authenticatable
{
    use HasUuids, HasFactory, BelongsToTenant;

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
}
