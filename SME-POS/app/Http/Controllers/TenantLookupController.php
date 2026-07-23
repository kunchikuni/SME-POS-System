<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Backs SignInPrompt's "does this store exist?" check — lets the sign-in
 * modal validate a typed subdomain before navigating away, instead of
 * bouncing the visitor to a raw framework 404 for what's usually just a
 * typo. Lives on the root domain (no tenant in context yet, same as
 * Register).
 *
 * Only returns a boolean, nothing else about the tenant — but this isn't
 * introducing a new information-disclosure surface: a subdomain's existence
 * is already trivially discoverable by visiting it directly (that's exactly
 * the 404-vs-not signal ResolveTenant already gives on any request). This
 * just surfaces the same signal without leaving the page. Rate-limited
 * (routes/web.php) as a reasonable precaution against scripted enumeration,
 * not because the check itself reveals anything new.
 */
class TenantLookupController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subdomain' => ['required', 'string', 'max:63'],
        ]);

        $exists = Tenant::where('subdomain', strtolower($data['subdomain']))
            ->where('status', '!=', 'suspended')
            ->exists();

        return response()->json(['exists' => $exists]);
    }
}
