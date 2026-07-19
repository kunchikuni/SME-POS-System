<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A completed sale. Immutable once written (docs §5.2). Client-generated UUID
 * is the idempotency key on push. Sales flow up (till -> server)
 * only; other tills don't pull each other's sales.
 */
class Sale extends Model
{
    use HasUuids, HasFactory, BelongsToTenant;

    protected $fillable = [
        'id', 'tenant_id', 'branch_id', 'device_id', 'cashier_id', 'table_id', 'status',
        'subtotal_cents', 'tax_cents', 'gratuity_cents', 'total_cents', 'currency',
        'fiscal_status', 'occurred_at', 'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'subtotal_cents' => 'integer',
            'tax_cents'      => 'integer',
            'gratuity_cents' => 'integer',
            'total_cents'    => 'integer',
            'occurred_at'    => 'datetime',
            'synced_at'      => 'datetime',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SaleLine::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(Table::class);
    }

    public function kitchenOrder(): HasOne
    {
        return $this->hasOne(KitchenOrder::class);
    }
}
