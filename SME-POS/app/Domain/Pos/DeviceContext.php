<?php

namespace App\Domain\Pos;

use App\Models\Device;

/** Holds the device authenticated for the current POS API request. */
class DeviceContext
{
    private ?Device $device = null;

    public function set(Device $device): void
    {
        $this->device = $device;
    }

    public function get(): ?Device
    {
        return $this->device;
    }

    public function branchId(): ?string
    {
        return $this->device?->branch_id;
    }
}
