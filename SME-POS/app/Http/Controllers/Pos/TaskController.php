<?php

namespace App\Http\Controllers\Pos;

use App\Domain\Pos\DeviceContext;
use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Till-side Tasks — deliberately online-first, not part of the offline sync
 * engine. A task list going briefly unreachable without network isn't a
 * business risk the way a lost sale is, so this is a plain bearer-token JSON
 * endpoint (same auth as PosController::session), not Dexie/outbox. The till
 * shows a simple "offline — try again" state if this fails.
 *
 * Read + complete only: creating and assigning tasks stays a dashboard,
 * admin-gated action (see the dashboard TaskController). cashier_id here is
 * self-reported by the till, same trust model as sale attribution (§7) — the
 * device bearer token is what's actually authenticated, not the cashier.
 */
class TaskController extends Controller
{
    public function index(DeviceContext $device): JsonResponse
    {
        $branchId = $device->branchId();

        $tasks = Task::query()
            ->where('status', 'open')
            ->where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $branchId))
            ->orderByRaw('due_at IS NULL, due_at asc')
            ->orderBy('created_at')
            ->with('assignee:id,name')
            ->get()
            ->map(fn (Task $t) => [
                'id'          => $t->id,
                'title'       => $t->title,
                'notes'       => $t->notes,
                'due_at'      => $t->due_at?->toIso8601String(),
                'assignee'    => $t->assignee?->name,
                'assigned_to' => $t->assigned_to,
            ]);

        return response()->json(['tasks' => $tasks]);
    }

    public function complete(Request $request, string $task): JsonResponse
    {
        $data = $request->validate([
            'cashier_id' => ['nullable', 'uuid'],
        ]);

        $model = Task::findOrFail($task);
        $model->update([
            'status'       => 'done',
            'completed_by' => $data['cashier_id'] ?? null,
            'completed_at' => now(),
        ]);

        return response()->json(['ok' => true]);
    }
}
