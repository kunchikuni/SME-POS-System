<?php

use App\Models\Branch;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;

it('provisions a tenant, owner, default branch, and trial on signup', function () {
    $response = $this->post('http://wivae.test/register', [
        'business_name'         => 'Kombi Spares',
        'subdomain'             => 'kombi-spares',
        'owner_name'            => 'Rudo M',
        'owner_email'           => 'rudo@example.com',
        'password'              => 'correct-horse-battery',
        'password_confirmation' => 'correct-horse-battery',
    ]);

    // Redirects to the new tenant's own subdomain to authenticate there.
    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('kombi-spares.wivae.test');

    $tenant = Tenant::withoutGlobalScopes()->where('subdomain', 'kombi-spares')->first();
    expect($tenant)->not->toBeNull();
    expect($tenant->trial_ends_at->isFuture())->toBeTrue();

    // Owner, default branch, and trialing subscription all exist for the tenant.
    expect(Branch::withoutGlobalScopes()->where('tenant_id', $tenant->id)->where('is_default', true)->count())->toBe(1);
    expect(User::withoutGlobalScopes()->where('tenant_id', $tenant->id)->where('role', 'owner')->count())->toBe(1);
    expect(Subscription::withoutGlobalScopes()->where('tenant_id', $tenant->id)->where('status', 'trialing')->count())->toBe(1);
});

it('rejects reserved and malformed subdomains', function () {
    $this->post('http://wivae.test/register', [
        'business_name'         => 'X',
        'subdomain'             => 'admin', // reserved
        'owner_name'            => 'A',
        'owner_email'           => 'a@example.com',
        'password'              => 'correct-horse-battery',
        'password_confirmation' => 'correct-horse-battery',
    ])->assertSessionHasErrors('subdomain');

    expect(Tenant::withoutGlobalScopes()->count())->toBe(0);
});
