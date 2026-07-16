<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A restaurant table. Server-authoritative catalog data, flowed to the till via
 * sync (like products). Only present/used when the tenant is in restaurant mode.
 */
class Table extends Model
{
    use HasUuids, HasFactory, BelongsToTenant, SoftDeletes;

    protected $fillable = [
        'branch_id', 'name', 'section', 'seats', 'is_active', 'sort',
    ];

    protected function casts(): array
    {
        return [
            'seats'     => 'integer',
            'is_active' => 'boolean',
            'sort'      => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
