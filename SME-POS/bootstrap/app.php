<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Inertia shared-data / asset-versioning middleware on web requests.
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
        ]);

        // Already-authenticated users hitting /login go to their dashboard.
        // Relative path keeps them on their current tenant subdomain.
        $middleware->redirectUsersTo('/dashboard');

        // ResolveTenant is applied per-route-group in routes/web.php, not
        // globally, so central onboarding routes run without a tenant.
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
