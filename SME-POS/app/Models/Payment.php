<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A tender label on a sale. Recorded, never charged (docs §1, §9.1). */
class Payment extends Model
{
    use HasUuids, BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['id', 'tenant_id', 'sale_id', 'method', 'amount_cents', 'currency'];

    protected function casts(): array
    {
        return ['amount_cents' => 'integer'];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }
}
