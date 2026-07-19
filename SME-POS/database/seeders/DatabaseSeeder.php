<?php

namespace Database\Seeders;

use App\Domain\Inventory\StockReason;
use App\Domain\Inventory\StockService;
use App\Domain\Tenancy\RegisterTenant;
use App\Domain\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Table;
use App\Models\Tenant;
use App\Models\User;
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
    private const DEVICE_TOKEN = 'demo-device-token';
    private const CASHIER_PIN = '1234';
    private const MANAGER_EMAIL = 'manager@demo.test';
    private const MANAGER_PASSWORD = 'password';

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

        // 15% VAT, matching the reference receipts — so the inclusive-VAT
        // breakdown (Net / VAT / Total) is actually exercised out of the box
        // rather than sitting dormant at the 0% default (docs/ARCHITECTURE.md §3).
        $tenant->update(['tax_rate_bps' => 1500]);

        $this->seedCatalogue($stock, $branchId);
        $this->seedDevice($branchId);
        $this->seedStaff($branchId);
        $this->seedTables($branchId);
        $this->report();
    }

    /**
     * A small floor plan. Only used when the tenant is in restaurant mode, but
     * harmless to seed for retail — the till simply never shows it.
     */
    private function seedTables(string $branchId): void
    {
        $tables = [
            ['T1', 'Main', 2], ['T2', 'Main', 4], ['T3', 'Main', 4], ['T4', 'Main', 6],
            ['P1', 'Patio', 2], ['P2', 'Patio', 2], ['P3', 'Patio', 4],
        ];

        foreach ($tables as $i => [$name, $section, $seats]) {
            Table::create([
                'branch_id' => $branchId,
                'name'      => $name,
                'section'   => $section,
                'seats'     => $seats,
                'sort'      => $i,
            ]);
        }
    }

    /**
     * A cashier with a till PIN, so the POS shift-login works out of the box.
     * The PIN is hashed like any credential; it ships to devices in bootstrap
     * for offline attribution only (docs/ARCHITECTURE.md §7). Cashiers are
     * till-only — no email, no password, no dashboard access at all (Staff
     * Management decision) — so this also seeds one Manager with dashboard
     * login, exercising both account shapes out of the box.
     */
    private function seedStaff(string $branchId): void
    {
        $cashier = new User([
            'branch_id' => $branchId,
            'name'      => 'Tariro',
            'role'      => 'cashier',
        ]);
        $cashier->setPin(self::CASHIER_PIN);
        $cashier->save();

        User::create([
            'branch_id' => $branchId,
            'name'      => 'Grace (Manager)',
            'email'     => self::MANAGER_EMAIL,
            'password'  => self::MANAGER_PASSWORD, // 'hashed' cast hashes on set
            'role'      => 'manager',
        ]);
    }

    private function seedDevice(string $branchId): void
    {
        $device = new \App\Models\Device([
            'branch_id' => $branchId,
            'name'      => 'Front Counter',
        ]);
        // Fixed token in dev so the PWA can authenticate without provisioning.
        $device->token_hash = \App\Models\Device::hashToken(self::DEVICE_TOKEN);
        $device->save();
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
        $this->command->line("  Device token (POS): " . self::DEVICE_TOKEN);
        $this->command->line("  Cashier PIN (till): " . self::CASHIER_PIN);
        $this->command->line("  Manager login: " . self::MANAGER_EMAIL . " / " . self::MANAGER_PASSWORD);
        $this->command->line("  Till URL: http://{$host}/pos");
        $this->command->line("  VAT rate: 15% (inclusive — Settings → General to change)");
        $this->command->line("  (add '127.0.0.1 {$host}' to your hosts file if you haven't)");
        $this->command->newLine();
        $this->command->line("  Restaurant mode (tables + kitchen at /kitchen): set the demo");
        $this->command->line("  tenant's mode to 'restaurant', e.g. via tinker:");
        $this->command->line("    Tenant::where('subdomain','demo')->update(['mode'=>'restaurant']);");
        $this->command->newLine();
    }
}
