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
        'tenant_id', 'category_id', 'sku', 'barcode', 'name', 'brand',
        'price_cents', 'cost_cents', 'currency', 'tax_class', 'type',
        'track_stock', 'low_stock_threshold', 'image_path', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'price_cents'         => 'integer',
            'cost_cents'          => 'integer',
            'low_stock_threshold' => 'integer',
            'track_stock'         => 'boolean',
            'is_active'           => 'boolean',
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

    /**
     * Gross margin as a percentage, or null when cost is unknown. Computed from
     * integer cents so there is no float drift in the inputs.
     */
    public function marginPercent(): ?float
    {
        if ($this->cost_cents === null || $this->price_cents <= 0) {
            return null;
        }

        return round((($this->price_cents - $this->cost_cents) / $this->price_cents) * 100, 1);
    }

    /**
     * Valuation basis for a unit: what the merchant paid, falling back to the
     * sell price when cost has not been captured yet.
     */
    public function valuationCents(): int
    {
        return $this->cost_cents ?? $this->price_cents;
    }
}
