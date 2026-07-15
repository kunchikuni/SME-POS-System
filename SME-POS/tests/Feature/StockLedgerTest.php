<?php

use App\Domain\Inventory\StockReason;
use App\Domain\Inventory\StockService;
use App\Domain\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Tenant;
use Illuminate\Support\Str;

/**
 * These tests exist to answer the Phase 2 question head-on: is stock-as-ledger
 * actually workable? If on-hand can't be trusted as SUM(delta), the whole
 * offline-sync design (Phase 3) collapses.
 */

beforeEach(function () {
    $this->tenant = Tenant::factory()->create();
    app(TenantContext::class)->set($this->tenant);           // stand in for ResolveTenant
    $this->branch = Branch::factory()->default()->create();
    $this->stock = app(StockService::class);
});

it('reports on-hand as the sum of ledger movements', function () {
    $product = Product::factory()->create();

    $this->stock->record($product, $this->branch->id, +10, StockReason::Purchase);
    $this->stock->record($product, $this->branch->id, -3, StockReason::Sale);

    expect($this->stock->levelFor($product->id, $this->branch->id))->toBe(7);
});

it('never conflicts when two offline sales hit the same unit — the deltas just sum', function () {
    $product = Product::factory()->create();
    $this->stock->record($product, $this->branch->id, +1, StockReason::Purchase); // last unit

    // Two tills, both offline, each rings up that unit and mints its own UUID.
    $this->stock->record($product, $this->branch->id, -1, StockReason::Sale, ref: 'sale-A', id: (string) Str::uuid());
    $this->stock->record($product, $this->branch->id, -1, StockReason::Sale, ref: 'sale-B', id: (string) Str::uuid());

    // Both sales are preserved (immutable, append-only)...
    expect(StockMovement::where('product_id', $product->id)->count())->toBe(3);
    // ...and the truth is simply the sum: oversold by one, visible, not lost.
    expect($this->stock->levelFor($product->id, $this->branch->id))->toBe(-1);
});

it('keeps the cached level identical to a full rebuild from the ledger', function () {
    $product = Product::factory()->create();

    foreach ([+50, -4, -1, +12, -7] as $delta) {
        $reason = $delta > 0 ? StockReason::Purchase : StockReason::Sale;
        $this->stock->record($product, $this->branch->id, $delta, $reason);
    }

    $cached = $this->stock->levelFor($product->id, $this->branch->id);
    $rebuilt = $this->stock->rebuild($product->id, $this->branch->id);

    expect($cached)->toBe(50)->and($rebuilt)->toBe($cached);
});

it('honours a client-supplied UUID so offline records keep their identity', function () {
    $product = Product::factory()->create();
    $clientId = (string) Str::uuid();

    $movement = $this->stock->record($product, $this->branch->id, -2, StockReason::Sale, id: $clientId);

    expect($movement->id)->toBe($clientId);
    expect(StockMovement::find($clientId))->not->toBeNull();
});
