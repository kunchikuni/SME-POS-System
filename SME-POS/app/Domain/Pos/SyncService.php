<?php

namespace App\Domain\Pos;

use App\Domain\Inventory\StockReason;
use App\Domain\Inventory\StockService;
use App\Domain\Tenancy\TenantContext;
use App\Models\Category;
use App\Models\KitchenOrder;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockLevel;
use App\Models\Table;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The offline sync engine. Three operations, all keyed on client-generated
 * UUIDs so replays are safe and offline records are first-class:
 *
 *   bootstrap() - full snapshot for a fresh device
 *   push()      - apply a batch of local mutations, idempotently
 *   pull()      - server-authoritative changes since the device's cursor
 *
 * Stock never mutates directly here: every sold line appends to the ledger via
 * StockService, so two offline tills selling the same unit just insert two
 * movements that sum correctly (docs/ARCHITECTURE.md §5.1, §6).
 */
class SyncService
{
    public function __construct(private StockService $stock) {}

    /** Full snapshot for a newly provisioned device. */
    public function bootstrap(string $branchId): array
    {
        return [
            'cursor'     => $this->now(),
            'categories' => Category::orderBy('name')->get(['id', 'name']),
            'products'   => Product::where('is_active', true)
                ->get(['id', 'category_id', 'sku', 'barcode', 'name', 'price_cents', 'currency', 'tax_class', 'type', 'track_stock']),
            'stock'      => StockLevel::where('branch_id', $branchId)
                ->get(['product_id', 'quantity']),
            // PIN hashes let cashiers log into a shift offline (attribution only).
            'staff'      => User::whereNotNull('pin_hash')
                ->get(['id', 'name', 'role', 'pin_hash']),
            // Restaurant floor plan (empty for retail tenants).
            'tables'     => Table::where('branch_id', $branchId)
                ->where('is_active', true)
                ->orderBy('sort')
                ->get(['id', 'name', 'section', 'seats']),
        ];
    }

    /**
     * Apply a batch of mutations. Returns the ids the server has now durably
     * applied — including ones applied on a previous (replayed) attempt.
     */
    public function push(array $mutations, string $deviceId, string $branchId): array
    {
        $acked = [];

        foreach ($mutations as $mutation) {
            $type = $mutation['type'] ?? null;

            $id = match ($type) {
                'sale.create' => $this->applySale($mutation['sale'], $deviceId, $branchId),
                default       => null, // unknown type: ignore rather than fail the batch
            };

            if ($id !== null) {
                $acked[] = $id;
            }
        }

        return ['acked' => $acked, 'cursor' => $this->now()];
    }

    /** Server-authoritative changes since the device last synced. */
    public function pull(string $since, string $branchId): array
    {
        $cursor = Carbon::parse($since);

        return [
            'cursor'     => $this->now(),
            'categories' => Category::where('updated_at', '>', $cursor)
                ->get(['id', 'name']),
            'products'   => Product::where('updated_at', '>', $cursor)
                ->get(['id', 'category_id', 'sku', 'barcode', 'name', 'price_cents', 'currency', 'tax_class', 'type', 'track_stock', 'is_active']),
            // Cross-branch stock changes (e.g. another till sold, or a transfer).
            'stock'      => StockLevel::where('branch_id', $branchId)
                ->where('updated_at', '>', $cursor)
                ->get(['product_id', 'quantity']),
            'tables'     => Table::where('branch_id', $branchId)
                ->where('updated_at', '>', $cursor)
                ->get(['id', 'name', 'section', 'seats', 'is_active']),
        ];
    }

    /**
     * Insert one completed sale with its lines, payments, and stock movements.
     * Idempotent: if the sale id already exists, we skip and simply ack it — a
     * replayed batch can't double-count. Everything is one transaction, so a
     * mid-flight failure leaves nothing partially applied.
     */
    private function applySale(array $data, string $deviceId, string $branchId): string
    {
        $saleId = $data['id'];

        if (Sale::whereKey($saleId)->exists()) {
            return $saleId; // already applied on a prior attempt
        }

        DB::transaction(function () use ($data, $saleId, $deviceId, $branchId) {
            $sale = Sale::create([
                'id'             => $saleId,
                'branch_id'      => $branchId,
                'device_id'      => $deviceId,
                'cashier_id'     => $data['cashier_id'] ?? null,
                'table_id'       => $data['table_id'] ?? null,
                'status'         => 'completed',
                'subtotal_cents' => $data['subtotal_cents'],
                'tax_cents'      => $data['tax_cents'] ?? 0,
                'gratuity_cents' => $data['gratuity_cents'] ?? 0,
                'total_cents'    => $data['total_cents'],
                'currency'       => $data['currency'] ?? 'USD',
                'occurred_at'    => $data['occurred_at'],
                'synced_at'      => now(),
            ]);

            foreach ($data['lines'] as $line) {
                $sale->lines()->create([
                    'id'               => $line['id'],
                    'product_id'       => $line['product_id'] ?? null,
                    'name'             => $line['name'],
                    'qty'              => $line['qty'],
                    'unit_price_cents' => $line['unit_price_cents'],
                    'line_total_cents' => $line['line_total_cents'],
                ]);

                // Decrement stock through the ledger, with the client-supplied
                // movement id so this too is idempotent.
                if (! empty($line['product_id']) && ! empty($line['movement_id'])) {
                    $product = Product::find($line['product_id']);
                    if ($product && $product->track_stock) {
                        $this->stock->record(
                            product: $product,
                            branchId: $branchId,
                            delta: -1 * (int) $line['qty'],
                            reason: StockReason::Sale,
                            ref: $saleId,
                            id: $line['movement_id'],
                            occurredAt: Carbon::parse($data['occurred_at']),
                        );
                    }
                }
            }

            foreach ($data['payments'] ?? [] as $payment) {
                $sale->payments()->create([
                    'id'           => $payment['id'],
                    'method'       => $payment['method'],
                    'amount_cents' => $payment['amount_cents'],
                    'currency'     => $payment['currency'] ?? 'USD',
                ]);
            }

            // Restaurant tenants get a kitchen ticket per sale. Created inside
            // the same transaction and only on first apply, so a replayed push
            // never spawns a duplicate ticket.
            if (app(TenantContext::class)->get()->isRestaurant()) {
                KitchenOrder::create([
                    'branch_id' => $branchId,
                    'sale_id'   => $saleId,
                    'table_id'  => $data['table_id'] ?? null,
                    'status'    => 'new',
                    'placed_at' => $data['occurred_at'],
                ]);
            }
        });

        return $saleId;
    }

    private function now(): string
    {
        return now()->toIso8601String();
    }
}
