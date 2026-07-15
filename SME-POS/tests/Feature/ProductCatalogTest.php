<?php

use App\Domain\Access\Role;
use App\Domain\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Tenant;
use App\Models\User;

it('records opening stock as an initial ledger entry, not a field on the product', function () {
    $tenant = Tenant::factory()->create(['subdomain' => 'shop']);
    app(TenantContext::class)->set($tenant);
    $branch = Branch::factory()->default()->create();

    $owner = User::factory()->create([
        'tenant_id' => $tenant->id,
        'branch_id' => $branch->id,
        'role'      => Role::Owner,
    ]);

    $this->actingAs($owner)
        ->post('http://shop.wivae.test/products', [
            'name'        => 'Water Bottle',
            'sku'         => 'WB-001',
            'price'       => '4.50',
            'type'        => 'retail',
            'track_stock' => true,
            'initial_qty' => 5,
        ])
        ->assertRedirect();

    $product = Product::where('sku', 'WB-001')->firstOrFail();

    // Price stored as integer cents, never a float.
    expect($product->price_cents)->toBe(450);

    // Opening quantity lives in the ledger.
    $movement = StockMovement::where('product_id', $product->id)->firstOrFail();
    expect($movement->reason->value)->toBe('initial');
    expect($movement->delta)->toBe(5);
});

it('scopes every read to the current tenant', function () {
    // Tenant A with a product.
    $a = Tenant::factory()->create();
    app(TenantContext::class)->set($a);
    Branch::factory()->default()->create();
    Product::factory()->create(['sku' => 'A-ONLY']);

    // Tenant B with its own product.
    $b = Tenant::factory()->create();
    app(TenantContext::class)->set($b);
    Branch::factory()->default()->create();
    Product::factory()->create(['sku' => 'B-ONLY']);

    // In B's context, only B's product is visible — A's is filtered out by the
    // global scope, no explicit where() required.
    expect(Product::pluck('sku')->all())->toBe(['B-ONLY']);

    app(TenantContext::class)->set($a);
    expect(Product::pluck('sku')->all())->toBe(['A-ONLY']);
});
