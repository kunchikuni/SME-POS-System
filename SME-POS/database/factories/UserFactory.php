<?php

namespace Database\Factories;

use App\Domain\Access\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

class UserFactory extends Factory
{
    protected $model = User::class;

    // tenant_id auto-filled by BelongsToTenant from context unless overridden.
    public function definition(): array
    {
        return [
            'name'     => $this->faker->name(),
            'email'    => $this->faker->unique()->safeEmail(),
            'password' => Hash::make('password'),
            'role'     => Role::Cashier,
        ];
    }

    public function owner(): static
    {
        return $this->state(['role' => Role::Owner]);
    }
}
