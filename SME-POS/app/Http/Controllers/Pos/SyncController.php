<?php

namespace App\Http\Controllers\Pos;

use App\Domain\Pos\DeviceContext;
use App\Domain\Pos\SyncService;
use App\Http\Controllers\Controller;
use App\Http\Requests\SyncPushRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    public function __construct(
        private SyncService $sync,
        private DeviceContext $device,
    ) {}

    public function bootstrap(): JsonResponse
    {
        return response()->json(
            $this->sync->bootstrap($this->device->branchId())
        );
    }

    public function push(SyncPushRequest $request): JsonResponse
    {
        $result = $this->sync->push(
            mutations: $request->input('mutations'),
            deviceId: $this->device->get()->id,
            branchId: $this->device->branchId(),
        );

        return response()->json($result);
    }

    public function pull(Request $request): JsonResponse
    {
        $request->validate(['since' => ['required', 'date']]);

        return response()->json(
            $this->sync->pull($request->query('since'), $this->device->branchId())
        );
    }
}
