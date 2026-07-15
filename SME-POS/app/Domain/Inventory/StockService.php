<?php

namespace App\Domain\Inventory;

use App\Models\Product;
use App\Models\StockLevel;
use App\Models\StockMovement;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The only thing that writes to the inventory ledger.
 *
 * Every sale, purchase, transfer, and adjustment goes through record(). That
 * single-writer discipline is what lets us trust stock_levels as a cache:
 * the movement and the cache update happen in one transaction, and the cache
 * is always rebuildable from the ledger via rebuild().
 *
 * In Phase 3 the sync engine will call record() (or a batch variant) for
 * movements that arrive from offline tills — same path, same guarantees.
 */
class StockService
{
    /**
     * Append one movement and update the cached level atomically.
     * `id` may be supplied (client-generated UUID from an offline till);
     * otherwise one is minted here.
     */
    public function record(
        Product $product,
        string $branchId,
        int $delta,
        StockReason $reason,
        ?string $ref = null,
        ?string $id = null,
        ?\DateTimeInterface $occurredAt = null,
    ): StockMovement {
        return DB::transaction(function () use ($product, $branchId, $delta, $reason, $ref, $id, $occurredAt) {
            $movement = StockMovement::create([
                'id'          => $id ?? (string) Str::uuid(),
                'tenant_id'   => $product->tenant_id,
                'branch_id'   => $branchId,
                'product_id'  => $product->id,
                'delta'       => $delta,
                'reason'      => $reason,
                'ref'         => $ref,
                'occurred_at' => $occurredAt ?? now(),
            ]);

            // Lock the cache row so concurrent movements can't lose an update.
            $level = StockLevel::query()
                ->where('branch_id', $branchId)
                ->where('product_id', $product->id)
                ->lockForUpdate()
                ->first();

            if ($level === null) {
                StockLevel::create([
                    'tenant_id'  => $product->tenant_id,
                    'branch_id'  => $branchId,
                    'product_id' => $product->id,
                    'quantity'   => $delta,
                ]);
            } else {
                $level->update(['quantity' => $level->quantity + $delta]);
            }

            return $movement;
        });
    }

    /** Current cached quantity for a product at a branch. */
    public function levelFor(string $productId, string $branchId): int
    {
        return (int) StockLevel::query()
            ->where('product_id', $productId)
            ->where('branch_id', $branchId)
            ->value('quantity') ?? 0;
    }

    /**
     * Recompute a cached level straight from the ledger. Proof the cache is
     * disposable, and the reconciliation hook the sync engine leans on after
     * a batch of offline movements lands.
     */
    public function rebuild(string $productId, string $branchId): int
    {
        $sum = (int) StockMovement::query()
            ->where('product_id', $productId)
            ->where('branch_id', $branchId)
            ->sum('delta');

        StockLevel::query()->updateOrCreate(
            ['branch_id' => $branchId, 'product_id' => $productId],
            ['tenant_id' => app(\App\Domain\Tenancy\TenantContext::class)->id(), 'quantity' => $sum],
        );

        return $sum;
    }
}
