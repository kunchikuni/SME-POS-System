<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Branch management (item 6). Revenue and staff counts are real reads, not
 * cached — fine at SME scale (a handful of branches), same posture as
 * AnalyticsService. A branch can't be deleted while it has sales history;
 * deactivate instead, which is what `is_active` is for.
 */
class BranchController extends Controller
{
    public function index(): Response
    {
        $branches = Branch::query()
            ->with('manager:id,name')
            ->withCount('staff')
            ->withSum(['sales as revenue_cents' => fn ($q) => $q->where('status', 'completed')], 'total_cents')
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get()
            ->map(fn (Branch $b) => [
                'id'            => $b->id,
                'name'          => $b->name,
                'address'       => $b->address,
                'phone'         => $b->phone,
                'is_default'    => $b->is_default,
                'is_active'     => $b->is_active,
                'mode'          => $b->mode,
                'manager'       => $b->manager?->name,
                'manager_id'    => $b->manager_id,
                'staff_count'   => $b->staff_count,
                'revenue_cents' => (int) ($b->revenue_cents ?? 0),
            ]);

        return Inertia::render('Branches/Index', [
            'branches' => $branches,
            'managers' => User::whereIn('role', ['owner', 'manager'])->get(['id', 'name']),
            'summary'  => [
                'total_branches' => $branches->count(),
                'active_branches' => $branches->where('is_active', true)->count(),
                'total_staff'     => $branches->sum('staff_count'),
                'combined_revenue_cents' => $branches->sum('revenue_cents'),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate([
            'name'       => ['required', 'string', 'max:100'],
            'address'    => ['nullable', 'string', 'max:255'],
            'phone'      => ['nullable', 'string', 'max:30'],
            'manager_id' => ['nullable', 'uuid', 'exists:users,id'],
            'mode'       => ['nullable', 'in:retail,restaurant'],
        ]);

        Branch::create($data);

        return to_route('branches.index')->with('flash', "Added {$data['name']}.");
    }

    public function update(Request $request, string $branch): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        // Resolved explicitly, not via implicit binding — see StaffController
        // for why (a route-middleware-timing race against ResolveTenant).
        $model = Branch::findOrFail($branch);

        $data = $request->validate([
            'name'       => ['required', 'string', 'max:100'],
            'address'    => ['nullable', 'string', 'max:255'],
            'phone'      => ['nullable', 'string', 'max:30'],
            'manager_id' => ['nullable', 'uuid', 'exists:users,id'],
            'is_active'  => ['boolean'],
            'mode'       => ['nullable', 'in:retail,restaurant'],
        ]);

        $model->update($data);

        return to_route('branches.index')->with('flash', "Updated {$model->name}.");
    }

    public function destroy(Request $request, string $branch): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $model = Branch::findOrFail($branch);

        if ($model->is_default) {
            return back()->with('flash', 'The main branch can’t be deleted.');
        }

        if ($model->sales()->exists()) {
            return back()->with('flash', 'This branch has sales history — deactivate it instead of deleting.');
        }

        $model->delete();

        return to_route('branches.index')->with('flash', "Removed {$model->name}.");
    }
}
