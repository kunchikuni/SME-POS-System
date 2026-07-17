<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a push batch. Shape matches App\Domain\Pos\SyncService: each
 * mutation has a `type` and, for 'sale.create', a `sale` object. Validation is
 * deliberately lenient on money fields — the service treats the sale as an
 * immutable client snapshot and does not recompute it, so we check structure
 * and types, not business totals.
 */
class SyncPushRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // authenticated by the ResolveDevice middleware (bearer token)
    }

    public function rules(): array
    {
        return [
            'mutations'                          => ['present', 'array'],
            'mutations.*.type'                   => ['required', 'string'],

            // sale.create payload
            'mutations.*.sale'                   => ['required_if:mutations.*.type,sale.create', 'array'],
            'mutations.*.sale.id'                => ['required_with:mutations.*.sale', 'uuid'],
            'mutations.*.sale.table_id'          => ['nullable', 'uuid'],
            'mutations.*.sale.gratuity_cents'    => ['nullable', 'integer', 'min:0'],
            'mutations.*.sale.total_cents'       => ['required_with:mutations.*.sale', 'integer'],
            'mutations.*.sale.subtotal_cents'    => ['required_with:mutations.*.sale', 'integer'],
            'mutations.*.sale.occurred_at'       => ['required_with:mutations.*.sale', 'date'],
            'mutations.*.sale.lines'             => ['required_with:mutations.*.sale', 'array', 'min:1'],
            'mutations.*.sale.lines.*.id'        => ['required', 'uuid'],
            'mutations.*.sale.lines.*.qty'       => ['required', 'integer', 'min:1'],
            'mutations.*.sale.lines.*.unit_price_cents' => ['required', 'integer'],
            'mutations.*.sale.lines.*.line_total_cents' => ['required', 'integer'],
        ];
    }
}
