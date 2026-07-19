<?php

namespace App\Http\Controllers;

use App\Domain\Access\Role;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Staff identity, role, and access (Staff Management). Deliberately NOT
 * scheduling, hours, or payroll — that's a different tab. Two account shapes,
 * enforced here and at the DB/auth layer (users migration + TenantUserProvider):
 *
 *   Owner/Manager — dashboard login (email + password), can administer.
 *   Cashier/Waiter — till only: name, role, branch, PIN. No email, no password,
 *     cannot authenticate into the dashboard at all.
 *
 * A new account's credential (temp password or PIN) is shown exactly once via
 * the flash.staffCredential mechanism — same reveal-once pattern as the
 * device-pairing token.
 */
class StaffController extends Controller
{
    public function index(): Response
    {
        $staff = User::query()
            ->with('branch:id,name')
            ->orderByRaw("CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'cashier' THEN 2 ELSE 3 END")
            ->orderBy('name')
            ->get()
            ->map(fn (User $u) => [
                'id'         => $u->id,
                'name'       => $u->name,
                'email'      => $u->email,
                'role'       => $u->role->value,
                'branch'     => $u->branch?->name,
                'branch_id'  => $u->branch_id,
                'has_pin'    => $u->pin_hash !== null,
                'dashboard'  => $u->role->canAccessDashboard(),
            ]);

        return Inertia::render('Staff/Index', [
            'staff'    => $staff,
            'branches' => Branch::where('is_active', true)->get(['id', 'name']),
            'roles'    => array_map(fn (Role $r) => ['value' => $r->value, 'label' => $r->label()], Role::cases()),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $data = $request->validate([
            'name'      => ['required', 'string', 'max:100'],
            'role'      => ['required', Rule::enum(Role::class)],
            'branch_id' => ['nullable', 'uuid', 'exists:branches,id'],
            'email'     => ['nullable', 'email', 'max:255'],
        ]);

        $role = Role::from($data['role']);
        $dashboard = $role->canAccessDashboard();

        if ($dashboard && empty($data['email'])) {
            return back()->withErrors(['email' => 'Owners and managers need an email to sign in.'])->withInput();
        }

        $credential = $dashboard ? User::generateTempPassword() : User::generatePin();

        // Use ?: null (not ?? null) so an empty string sent from the "None"
        // branch select is also converted to null. ?? null only catches actual
        // null, but HTML selects / JSON fields can send "" for no-selection.
        $user = new User([
            'name'      => $data['name'],
            'role'      => $data['role'],
            'branch_id' => ($data['branch_id'] ?: null),
            'email'     => $dashboard ? $data['email'] : null,
            'password'  => $dashboard ? $credential : null,
        ]);
        if (! $dashboard) {
            $user->setPin($credential);
        }
        $user->save();

        return back()->with('staffCredential', [
            'name'  => $user->name,
            'kind'  => $dashboard ? 'password' : 'pin',
            'value' => $credential,
        ])->with('flash', "Added {$user->name}.");
    }

    public function update(Request $request, string $staff): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        // Resolved explicitly, not via implicit route-model-binding: binding
        // happens as route middleware runs, and can resolve before
        // ResolveTenant has set the tenant context — the same class of race
        // TenantUserProvider was written to avoid for auth (see its docblock).
        // Inside the controller body, ResolveTenant has definitely already run.
        $user = User::findOrFail($staff);

        $data = $request->validate([
            'name'      => ['required', 'string', 'max:100'],
            'role'      => ['required', Rule::enum(Role::class)],
            'branch_id' => ['nullable', 'uuid', 'exists:branches,id'],
            'email'     => ['nullable', 'email', 'max:255'],
        ]);

        $role = Role::from($data['role']);
        $dashboard = $role->canAccessDashboard();

        if ($dashboard && empty($data['email']) && $user->email === null) {
            return back()->withErrors(['email' => 'Owners and managers need an email to sign in.'])->withInput();
        }

        // A role change can flip account shape. Moving a dashboard user to a
        // till-only role clears their password (they can no longer sign in);
        // moving a till-only user up requires an email, checked above.
        $user->name = $data['name'];
        $user->role = $data['role'];
        // ?: null (not ?? null): converts both null AND empty string ""
        // to null, so selecting "— None —" in the branch dropdown never
        // reaches the DB as an empty-string FK that fails the constraint.
        $user->branch_id = ($data['branch_id'] ?: null);
        $user->email = $dashboard ? (($data['email'] ?: null) ?? $user->email) : null;
        if (! $dashboard) {
            $user->password = null;
        }
        $user->save();

        return back()->with('flash', "Updated {$user->name}.");
    }

    /** Deactivate, not delete — a soft-delete keeps Sale::cashier_id attribution intact. */
    public function destroy(Request $request, string $staff): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $user = User::findOrFail($staff);

        if ($user->id === $request->user()->id) {
            return back()->with('flash', 'You can’t deactivate your own account.');
        }
        if ($user->role === Role::Owner) {
            return back()->with('flash', 'The owner account can’t be deactivated.');
        }

        $user->delete();

        return back()->with('flash', "Deactivated {$user->name}.");
    }

    public function restore(Request $request, string $staff): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $user = User::withTrashed()->findOrFail($staff);
        $user->restore();

        return back()->with('flash', "Reactivated {$user->name}.");
    }

    /** A fresh PIN, shown once. Works for any role — dashboard staff can still ring up sales. */
    public function resetPin(Request $request, string $staff): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $user = User::findOrFail($staff);
        $pin = User::generatePin();
        $user->setPin($pin);
        $user->save();

        return back()->with('staffCredential', [
            'name'  => $user->name,
            'kind'  => 'pin',
            'value' => $pin,
        ])->with('flash', "PIN reset for {$user->name}.");
    }

    /** A fresh temporary password, shown once. Dashboard roles only. */
    public function resetPassword(Request $request, string $staff): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $user = User::findOrFail($staff);

        if (! $user->role->canAccessDashboard()) {
            return back()->with('flash', 'This account is till-only and has no dashboard password.');
        }

        $password = User::generateTempPassword();
        $user->password = $password; // 'hashed' cast hashes it on save
        $user->save();

        return back()->with('staffCredential', [
            'name'  => $user->name,
            'kind'  => 'password',
            'value' => $password,
        ])->with('flash', "Password reset for {$user->name}.");
    }
}
