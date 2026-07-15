<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Cached SUM(delta) per product/branch. Written only by StockService. */
class StockLevel extends Model
{
    use HasUuids, BelongsToTenant;

    const CREATED_AT = null;

    protected $fillable = ['tenant_id', 'branch_id', 'product_id', 'quantity'];

    protected function casts(): array
    {
        return ['quantity' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
