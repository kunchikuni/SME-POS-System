<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Device;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DeviceController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Devices/Index', [
            'devices'  => Device::with('branch:id,name')->orderBy('name')
                ->get(['id', 'name', 'branch_id', 'last_seen_at']),
            'branches' => Branch::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('administer');

        $data = $request->validate([
            'name'      => ['required', 'string', 'max:80'],
            'branch_id' => ['required', 'uuid'],
        ]);

        $device = new Device($data);
        $token = $device->issueToken();   // plaintext shown once
        $device->save();

        // Flash the token so the provisioning screen can display it a single time.
        return to_route('devices.index')->with('deviceToken', [
            'name'  => $device->name,
            'token' => $token,
        ]);
    }

    public function destroy(Device $device): RedirectResponse
    {
        $this->authorize('administer');
        $device->delete();

        return to_route('devices.index')->with('flash', 'Device removed.');
    }
}
