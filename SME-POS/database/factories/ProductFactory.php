<?php

namespace Database\Factories;

use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

class ProductFactory extends Factory
{
    protected $model = Product::class;

    public function definition(): array
    {
        return [
            'sku'         => strtoupper($this->faker->unique()->bothify('SKU-####')),
            'name'        => ucfirst($this->faker->words(2, true)),
            'price_cents' => $this->faker->numberBetween(50, 50000),
            'currency'    => 'USD',
            'type'        => 'retail',
            'track_stock' => true,
            'is_active'   => true,
        ];
    }
}
