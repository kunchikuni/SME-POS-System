<?php

namespace Database\Factories;

use App\Models\Branch;
use Illuminate\Database\Eloquent\Factories\Factory;

class BranchFactory extends Factory
{
    protected $model = Branch::class;

    // tenant_id is auto-filled by the BelongsToTenant trait from context.
    public function definition(): array
    {
        return ['name' => $this->faker->city(), 'is_default' => false];
    }

    public function default(): static
    {
        return $this->state(['is_default' => true, 'name' => 'Main Branch']);
    }
}
