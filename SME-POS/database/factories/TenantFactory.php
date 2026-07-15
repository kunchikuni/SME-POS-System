<?php

namespace Database\Factories;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

class TenantFactory extends Factory
{
    protected $model = Tenant::class;

    public function definition(): array
    {
        return [
            'name'          => $this->faker->company(),
            'subdomain'     => $this->faker->unique()->domainWord(),
            'plan'          => 'trial',
            'status'        => 'active',
            'trial_ends_at' => now()->addDays(7),
        ];
    }
}
