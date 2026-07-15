<?php

namespace App\Domain\Access;

/**
 * Staff roles within a tenant. Ordered loosely by authority; helpers below
 * express capabilities so policies read as intent, not as role lists.
 */
enum Role: string
{
    case Owner   = 'owner';
    case Manager = 'manager';
    case Cashier = 'cashier';
    case Waiter  = 'waiter';

    public function label(): string
    {
        return ucfirst($this->value);
    }

    /** Can manage billing, staff, and tenant-wide settings. */
    public function canAdminister(): bool
    {
        return in_array($this, [self::Owner, self::Manager], true);
    }

    /** Can operate the till and take sales. */
    public function canSell(): bool
    {
        return true; // every role can ring up a sale
    }

    /** Only the owner can change billing or delete the tenant. */
    public function isOwner(): bool
    {
        return $this === self::Owner;
    }
}
