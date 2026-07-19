<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Self-service account settings. Any dashboard user (Owner/Manager — the only
 * roles that reach here at all) changes their own password here, e.g. after
 * an admin-issued temporary password from StaffController.
 */
class AccountController extends Controller
{
    public function edit(Request $request): Response
    {
        return Inertia::render('Settings/Account', [
            'name'  => $request->user()->name,
            'email' => $request->user()->email,
        ]);
    }

    public function updatePassword(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password'         => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $request->user()->update(['password' => $data['password']]);

        return back()->with('flash', 'Password updated.');
    }
}
