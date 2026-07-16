<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

/**
 * Serves the built POS PWA shell (public/pos/index.html) for /pos requests on a
 * tenant subdomain. Hashed assets under /pos/assets/* are real files served
 * directly by the web server; only the shell route falls through to here.
 *
 * Invokable (not a route closure) so the route stays cacheable by route:cache.
 * No tenant/session middleware: the shell is static and tenant-agnostic — the
 * device bearer token, not the host, drives everything once it loads (§7).
 */
class PosShellController extends Controller
{
    public function __invoke(): Response
    {
        $index = public_path('pos/index.html');

        abort_unless(
            is_file($index),
            404,
            'POS build not found. Run: npm run pos:build',
        );

        return response(file_get_contents($index), 200)
            ->header('Content-Type', 'text/html; charset=UTF-8');
    }
}
