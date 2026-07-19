<?php

/*
|--------------------------------------------------------------------------
| Development router script for `php artisan serve` — DEV ONLY
|--------------------------------------------------------------------------
| ServeCommand prefers a root-level server.php over the framework's bundled
| resources/server.php, so this file overrides it during local development.
| It is NEVER used in production: Apache/nginx point DocumentRoot at public/
| and handle static files and rewrites themselves.
|
| Why it exists: the POS PWA builds to public/pos/, and a REAL DIRECTORY under
| public/ makes PHP's built-in server mis-populate $_SERVER for paths beneath
| it — see the FIX block below. Without this, every /pos/* API route 404s while
| `route:list` shows them registered correctly.
*/

$publicPath = getcwd();

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? ''
);

// Emulate mod_rewrite: serve real files (and directories, e.g. /pos ->
// public/pos/index.html) directly. Verified NOT to swallow /pos/session,
// /sync/*, or PWA deep links, which correctly fall through to Laravel.
if ($uri !== '/' && file_exists($publicPath.$uri)) {
    return false;
}

/*
| FIX: When a real directory (e.g. public/pos/) exists under public/, the PHP
| built-in server maps requests like /pos/session by treating
| public/pos/index.html as the "script", setting:
|
|   SCRIPT_NAME     = /pos/index.html
|   SCRIPT_FILENAME = .../public/pos/index.html
|   PHP_SELF        = /pos/index.html/session
|
| Symfony's Request::prepareBaseUrl() derives the base URL from those values,
| and preparePathInfo() then strips it from REQUEST_URI — yielding "/session"
| instead of "/pos/session", so no route matches and Laravel returns 404.
|
| Resetting them to the real front controller makes the computed base URL empty,
| so getPathInfo() returns the full, correct path.
|
| NOTE: Symfony does not read $_SERVER['PATH_INFO'] (it recomputes path info
| from REQUEST_URI and the base URL), so these three assignments are what
| actually fix it.
*/
$_SERVER['SCRIPT_NAME']     = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = $publicPath.'/index.php';
$_SERVER['PHP_SELF']        = '/index.php';

$formattedDateTime = date('D M j H:i:s Y');

$requestMethod = $_SERVER['REQUEST_METHOD'];
$remoteAddress = $_SERVER['REMOTE_ADDR'].':'.$_SERVER['REMOTE_PORT'];

file_put_contents('php://stdout', "[$formattedDateTime] $remoteAddress [$requestMethod] URI: $uri\n");

require_once $publicPath.'/index.php';
