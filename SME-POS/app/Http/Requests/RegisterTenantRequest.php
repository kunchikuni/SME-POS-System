<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class RegisterTenantRequest extends FormRequest
{
    /** Subdomains we must not hand out to tenants. */
    private const RESERVED = ['www', 'app', 'api', 'admin', 'mail', 'billing', 'status'];

    public function authorize(): bool
    {
        return true; // public onboarding route
    }

    public function rules(): array
    {
        return [
            'business_name' => ['required', 'string', 'max:120'],
            'subdomain' => [
                'required', 'string', 'min:3', 'max:40',
                'regex:/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/', // dns-safe label
                Rule::notIn(self::RESERVED),
                Rule::unique('tenants', 'subdomain'),
            ],
            'owner_name' => ['required', 'string', 'max:120'],
            'owner_email' => ['required', 'email', 'max:190'],
            'password' => ['required', 'confirmed', Password::defaults()],
        ];
    }

    public function messages(): array
    {
        return [
            'subdomain.regex' => 'Use lowercase letters, numbers, and hyphens only.',
            'subdomain.not_in' => 'That address is reserved. Pick another.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('subdomain')) {
            $this->merge(['subdomain' => strtolower(trim($this->input('subdomain')))]);
        }
    }
}
