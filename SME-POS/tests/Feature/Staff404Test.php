<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Staff404Test extends TestCase
{
    public function test_assign_branch_returns_404()
    {
        $tenant = Tenant::withoutGlobalScopes()->first();
        $owner = User::withoutGlobalScopes()->where('tenant_id', $tenant->id)->where('role', 'owner')->first();
        $cashier = User::withoutGlobalScopes()->where('tenant_id', $tenant->id)->where('role', 'cashier')->first();

        // Simulate subdomain
        $url = "http://{$tenant->subdomain}." . config('brand.tenant_domain') . "/staff/{$cashier->id}";

        $response = $this->actingAs($owner)->patch($url, [
            'name' => 'Cashier Edited',
            'role' => 'cashier',
            'branch_id' => null,
            'email' => ''
        ], ['X-Inertia' => 'true']);

        echo "PATCH Status: " . $response->status() . "\n";
        if ($response->status() >= 400) {
            echo "Response Content: " . substr($response->getContent(), 0, 500) . "\n";
        }

        // Test Delete
        $responseDelete = $this->actingAs($owner)->delete($url, [], ['X-Inertia' => 'true']);
        echo "DELETE Status: " . $responseDelete->status() . "\n";
    }
}
