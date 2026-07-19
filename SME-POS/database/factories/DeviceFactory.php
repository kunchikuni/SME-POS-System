<?php

namespace Database\Factories;

use App\Models\Device;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class DeviceFactory extends Factory
{
    protected $model = Device::class;

    // tenant_id auto-filled from context; pass branch_id when creating.
    public function definition(): array
    {
        return [
            'name'       => 'Till ' . $this->faker->numberBetween(1, 9),
            'token_hash' => Device::hashToken('wv_' . Str::random(48)),
        ];
    }
}
