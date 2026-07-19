<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Dashboard side of Tasks. Any signed-in staff (Owner/Manager — the only
 * roles that reach the dashboard at all) can view and complete tasks;
 * creating, assigning, and deleting is admin-gated. Cashier/Waiter reach
 * Tasks through the till instead (Pos\TaskController) — a lighter,
 * online-first endpoint, not the offline sync engine (docs/ARCHITECTURE.md,
 * Tasks scoping note).
 *
 * Models are resolved explicitly via findOrFail(), not implicit route-model
 * binding — binding can race ResolveTenant setting the tenant context and
 * 404 spuriously; see StaffController for the full explanation.
 */
class TaskController extends Controller
{
    public function index(Request $request): Response
    {
        $status = $request->string('status', 'open')->value();
        if (! in_array($status, ['open', 'done', 'all'], true)) {
            $status = 'open';
        }

        $tasks = Task::query()
            ->with(['assignee:id,name', 'creator:id,name', 'branch:id,name'])
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->orderByRaw("due_at IS NULL, due_at asc")
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Task $t) => [
                'id'           => $t->id,
                'title'        => $t->title,
                'notes'        => $t->notes,
                'status'       => $t->status,
                'due_at'       => $t->due_at?->toIso8601String(),
                'completed_at' => $t->completed_at?->toIso8601String(),
                'assignee'     => $t->assignee?->name,
                'assigned_to'  => $t->assigned_to,
                'creator'      => $t->creator?->name,
                'branch'       => $t->branch?->name,
                'branch_id'    => $t->branch_id,
            ]);

        return Inertia::render('Tasks/Index', [
            'tasks'    => $tasks,
            'status'   => $status,
            'staff'    => User::orderBy('name')->get(['id', 'name']),
            'branches' => Branch::where('is_active', true)->get(['id', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate([
            'title'       => ['required', 'string', 'max:150'],
            'notes'       => ['nullable', 'string', 'max:1000'],
            'branch_id'   => ['nullable', 'uuid', 'exists:branches,id'],
            'assigned_to' => ['nullable', 'uuid', 'exists:users,id'],
            'due_at'      => ['nullable', 'date'],
        ]);

        Task::create([...$data, 'created_by' => $request->user()->id]);

        return back()->with('flash', 'Task added.');
    }

    public function update(Request $request, string $task): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $model = Task::findOrFail($task);

        $data = $request->validate([
            'title'       => ['required', 'string', 'max:150'],
            'notes'       => ['nullable', 'string', 'max:1000'],
            'branch_id'   => ['nullable', 'uuid', 'exists:branches,id'],
            'assigned_to' => ['nullable', 'uuid', 'exists:users,id'],
            'due_at'      => ['nullable', 'date'],
        ]);

        $model->update($data);

        return back()->with('flash', 'Task updated.');
    }

    /** Any dashboard user can complete a task, not just admins — it's a checklist, not a permission. */
    public function complete(Request $request, string $task): RedirectResponse
    {
        $model = Task::findOrFail($task);
        $model->update([
            'status'       => 'done',
            'completed_by' => $request->user()->id,
            'completed_at' => now(),
        ]);

        return back()->with('flash', "Marked \"{$model->title}\" done.");
    }

    public function reopen(Request $request, string $task): RedirectResponse
    {
        $model = Task::findOrFail($task);
        $model->update(['status' => 'open', 'completed_by' => null, 'completed_at' => null]);

        return back()->with('flash', "Reopened \"{$model->title}\".");
    }

    public function destroy(Request $request, string $task): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        Task::findOrFail($task)->delete();

        return back()->with('flash', 'Task removed.');
    }
}
