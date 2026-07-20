<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ZIMRA FDMS device registration state. See the migration for field provenance. */
class FiscalDevice extends Model
{
    use HasUuids, BelongsToTenant;

    protected $fillable = [
        'branch_id', 'zimra_device_id', 'activation_key', 'device_serial_no',
        'device_model_name', 'device_model_version', 'taxpayer_name', 'taxpayer_tin',
        'vat_number', 'device_branch_name', 'device_branch_address', 'verified_at',
        'certificate', 'private_key', 'certificate_valid_till',
        'fiscal_day_status', 'fiscal_day_no', 'receipt_global_no', 'environment',
    ];

    protected $hidden = ['activation_key', 'private_key'];

    protected function casts(): array
    {
        return [
            'device_branch_address'  => 'array',
            'verified_at'            => 'datetime',
            'certificate_valid_till' => 'datetime',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function isVerified(): bool
    {
        return $this->verified_at !== null;
    }

    public function isRegistered(): bool
    {
        return $this->certificate !== null;
    }
}
