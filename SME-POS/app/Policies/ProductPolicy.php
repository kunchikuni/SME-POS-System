<?php

namespace App\Policies;

use App\Models\Product;
use App\Models\User;

/**
 * Products are already tenant-scoped by the global scope, so a user can only
 * ever load their own tenant's products. These checks gate *mutation* by role.
 */
class ProductPolicy
{
    public function viewAny(User $user): bool
    {
        return true; // any staff can browse the catalogue
    }

    public function create(User $user): bool
    {
        return $user->role->canAdminister();
    }

    public function update(User $user, Product $product): bool
    {
        return $user->role->canAdminister();
    }

    public function delete(User $user, Product $product): bool
    {
        return $user->role->canAdminister();
    }
}
