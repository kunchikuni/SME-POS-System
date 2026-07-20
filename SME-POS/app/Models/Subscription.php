<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Wivae's own subscription for a tenant (BYOD $30/mo, ZIMRA add-on $20/mo).
 * Billed via Paynow — see docs/ARCHITECTURE.md §9.1. Not the customer's
 * in-store payments; those are recorded as labels on sales, not here.
 */
class Subscription extends Model
{
    use HasUuids, HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'plan', 'status', 'current_period_end',
        'zimra_addon', 'provider_ref', 'poll_url',
    ];

    protected function casts(): array
    {
        return [
            'current_period_end' => 'datetime',
            'zimra_addon'        => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
