<?php

namespace App\Models;

use App\Domain\Inventory\StockReason;
use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One immutable row in the inventory ledger. Never updated, never deleted.
 * `const UPDATED_AT = null` enforces the append-only contract at the model
 * level — Eloquent won't try to touch an updated_at that doesn't exist.
 */
class StockMovement extends Model
{
    use HasUuids, HasFactory, BelongsToTenant;

    const UPDATED_AT = null;

    protected $fillable = [
        'id', 'tenant_id', 'branch_id', 'product_id',
        'delta', 'reason', 'ref', 'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'delta'       => 'integer',
            'reason'      => StockReason::class,
            'occurred_at' => 'datetime',
            'created_at'  => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
