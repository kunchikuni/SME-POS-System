<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A kitchen ticket, derived from a restaurant sale on push. The kitchen display
 * reads these and advances status; the till never pulls them back (operational
 * state, not part of the sync contract). Its lines are the sale's lines.
 */
class KitchenOrder extends Model
{
    use HasUuids, HasFactory, BelongsToTenant, SoftDeletes;

    protected $fillable = [
        'branch_id', 'sale_id', 'table_id', 'ticket_no', 'status', 'placed_at', 'ready_at',
    ];

    protected function casts(): array
    {
        return [
            'placed_at' => 'datetime',
            'ready_at'  => 'datetime',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(Table::class);
    }
}
