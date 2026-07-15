<?php

namespace Database\Seeders;

use App\Domain\Inventory\StockReason;
use App\Domain\Inventory\StockService;
use App\Domain\Tenancy\RegisterTenant;
use App\Domain\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

/**
 * Dev seeder. Creates one demo merchant you can actually log into, then fills
 * its catalogue so the dashboard isn't a wall of empty states.
 *
 * Everything goes through the real code paths — RegisterTenant for onboarding,
 * StockService for opening stock — so seeded data is indistinguishable from
 * data a user would create, and exercises those paths on every fresh install.
 *
 * Re-runnable: skips if the demo tenant already exists. To rebuild from
 * scratch: `php artisan migrate:fresh --seed`.
 */
class DatabaseSeeder extends Seeder
{
    private const SUBDOMAIN = 'demo';
    private const OWNER_EMAIL = 'owner@demo.test';
    private const OWNER_PASSWORD = 'password';

    public function run(RegisterTenant $register, StockService $stock): void
    {
        if (Tenant::withoutGlobalScopes()->where('subdomain', self::SUBDOMAIN)->exists()) {
            $this->command->warn('Demo tenant already exists — skipping. Use migrate:fresh --seed to rebuild.');
            return;
        }

        ['tenant' => $tenant] = $register->handle(
            businessName: 'Demo Store',
            subdomain:    self::SUBDOMAIN,
            ownerName:    'Demo Owner',
            ownerEmail:   self::OWNER_EMAIL,
            password:     self::OWNER_PASSWORD,
        );

        // RegisterTenant runs on the central path with no tenant in context;
        // set it now so catalogue rows auto-scope to this tenant.
        app(TenantContext::class)->set($tenant);
        $branchId = Branch::where('is_default', true)->value('id');

        $this->seedCatalogue($stock, $branchId);
        $this->report();
    }

    private function seedCatalogue(StockService $stock, string $branchId): void
    {
        // name, price in DOLLARS, category, opening quantity
        $catalogue = [
            ['Bread (loaf)',        1.20, 'Groceries',  40],
            ['Sugar 2kg',           2.50, 'Groceries',  25],
            ['Cooking Oil 2L',      3.80, 'Groceries',  18],
            ['Mealie Meal 10kg',    7.50, 'Groceries',  12],
            ['Mazoe Orange 2L',     4.00, 'Beverages',  30],
            ['Bottled Water 500ml', 0.50, 'Beverages', 120],
            ['Dishwashing Liquid',  1.90, 'Household',  22],
            ['Bath Soap',           0.80, 'Household',  60],
        ];

        $categories = [];
        $sku = 1000;

        foreach ($catalogue as [$name, $price, $categoryName, $qty]) {
            $categories[$categoryName] ??= Category::firstOrCreate(['name' => $categoryName]);

            $product = Product::create([
                'category_id' => $categories[$categoryName]->id,
                'sku'         => 'SKU-' . $sku++,
                'name'        => $name,
                'price_cents' => (int) round($price * 100), // dollars -> cents
                'type'        => 'retail',
                'track_stock' => true,
            ]);

            // Opening stock is a ledger entry, same as a purchase would be.
            $stock->record($product, $branchId, $qty, StockReason::Initial);
        }
    }

    private function report(): void
    {
        $host = self::SUBDOMAIN . '.' . config('brand.tenant_domain');

        $this->command->newLine();
        $this->command->info('Demo tenant ready.');
        $this->command->line("  URL:      http://{$host}/login");
        $this->command->line('  Email:    ' . self::OWNER_EMAIL);
        $this->command->line('  Password: ' . self::OWNER_PASSWORD);
        $this->command->line("  (add '127.0.0.1 {$host}' to your hosts file if you haven't)");
        $this->command->newLine();
    }
}
