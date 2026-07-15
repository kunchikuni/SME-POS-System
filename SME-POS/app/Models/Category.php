<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    use HasUuids, HasFactory, BelongsToTenant;

    protected $fillable = ['tenant_id', 'name'];

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
