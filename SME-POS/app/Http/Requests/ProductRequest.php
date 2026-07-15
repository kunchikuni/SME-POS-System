<?php

namespace App\Http\Requests;

use App\Domain\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('administer');
    }

    public function rules(): array
    {
        $tenantId = app(TenantContext::class)->id();
        $productId = $this->route('product')?->id;

        return [
            'name'        => ['required', 'string', 'max:160'],
            'sku'         => [
                'required', 'string', 'max:64',
                Rule::unique('products', 'sku')
                    ->where('tenant_id', $tenantId)
                    ->ignore($productId),
            ],
            'barcode'     => ['nullable', 'string', 'max:64'],
            'category_id' => ['nullable', 'uuid', Rule::exists('categories', 'id')->where('tenant_id', $tenantId)],
            // Accept dollars from the form; convert to integer cents in the controller.
            'price'       => ['required', 'numeric', 'min:0', 'max:1000000'],
            'tax_class'   => ['nullable', 'string', 'max:32'],
            'type'        => ['required', Rule::in(['retail', 'restaurant'])],
            'track_stock' => ['boolean'],
            'initial_qty' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /** Price in integer minor units. Never store the float. */
    public function priceCents(): int
    {
        return (int) round(((float) $this->input('price')) * 100);
    }
}
