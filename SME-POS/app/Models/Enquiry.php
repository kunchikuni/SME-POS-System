<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * A Business or Enterprise tier quote request — see interested_in for
 * which. NOT tenant-scoped — captured before any tenant exists, on the root
 * marketing domain. See the migration for why this is a separate flow from
 * the real BYOD/Standard/Premium billing.
 */
class Enquiry extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'business_name', 'interested_in', 'email', 'phone', 'message', 'status'];
}
