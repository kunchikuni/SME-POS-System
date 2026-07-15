<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasUuids, HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'category_id', 'sku', 'barcode', 'name',
        'price_cents', 'currency', 'tax_class', 'type', 'track_stock',
        'image_path', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'price_cents' => 'integer',
            'track_stock' => 'boolean',
            'is_active'   => 'boolean',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function stockLevels(): HasMany
    {
        return $this->hasMany(StockLevel::class);
    }

    /** Price as a decimal string for display. Storage stays integer cents. */
    public function priceDollars(): string
    {
        return number_format($this->price_cents / 100, 2, '.', '');
    }
}
