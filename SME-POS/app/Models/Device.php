<?php

namespace App\Models;

use App\Domain\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * A provisioned till. Authenticates the POS sync API by bearer token — only the
 * SHA-256 hash is stored, and the plaintext is shown once at provisioning.
 * Tenancy for a sync request is resolved from this credential, not the host.
 */
class Device extends Model
{
    use HasUuids, HasFactory, BelongsToTenant, SoftDeletes;

    protected $fillable = ['tenant_id', 'branch_id', 'name', 'last_seen_at'];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['last_seen_at' => 'datetime'];
    }

    /** Hash a plaintext token for storage/lookup. */
    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * Mint a new bearer token, store its hash on the model, and return the
     * plaintext to the caller once. Save the model afterwards to persist.
     */
    public function issueToken(): string
    {
        $token = 'wv_' . Str::random(48);
        $this->token_hash = self::hashToken($token);

        return $token;
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
