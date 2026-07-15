<?php

namespace App\Http\Controllers;

use App\Domain\Inventory\StockReason;
use App\Domain\Inventory\StockService;
use App\Http\Requests\ProductRequest;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function __construct(private StockService $stock) {}

    public function index(): Response
    {
        $products = Product::query()
            ->with('category:id,name')
            ->withSum('stockLevels as on_hand', 'quantity')
            ->orderBy('name')
            ->paginate(30)
            ->through(fn (Product $p) => [
                'id'       => $p->id,
                'name'     => $p->name,
                'sku'      => $p->sku,
                'price'    => $p->priceDollars(),
                'category' => $p->category?->name,
                'onHand'   => (int) ($p->on_hand ?? 0),
                'tracked'  => $p->track_stock,
            ]);

        return Inertia::render('Products/Index', ['products' => $products]);
    }

    public function create(): Response
    {
        return Inertia::render('Products/Create', [
            'categories' => Category::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(ProductRequest $request, StockService $stock): RedirectResponse
    {
        $product = Product::create([
            'category_id' => $request->input('category_id'),
            'sku'         => $request->string('sku'),
            'barcode'     => $request->input('barcode'),
            'name'        => $request->string('name'),
            'price_cents' => $request->priceCents(),
            'tax_class'   => $request->input('tax_class', 'standard'),
            'type'        => $request->string('type'),
            'track_stock' => $request->boolean('track_stock', true),
        ]);

        // Opening stock is not a magic number on the product — it's the first
        // entry in the ledger, so on-hand is always the sum of movements.
        $initial = (int) $request->input('initial_qty', 0);
        if ($product->track_stock && $initial > 0) {
            $this->stock->record(
                product: $product,
                branchId: $this->defaultBranchId(),
                delta: $initial,
                reason: StockReason::Initial,
            );
        }

        return to_route('products.index')->with('flash', "Added {$product->name}.");
    }

    public function destroy(Product $product): RedirectResponse
    {
        $this->authorize('administer');
        $product->delete(); // soft delete; ledger history is preserved

        return to_route('products.index')->with('flash', 'Product removed.');
    }

    private function defaultBranchId(): string
    {
        return Branch::where('is_default', true)->value('id')
            ?? Branch::query()->value('id');
    }
}
