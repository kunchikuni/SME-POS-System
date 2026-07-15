<?php

/*
|--------------------------------------------------------------------------
| Brand configuration
|--------------------------------------------------------------------------
|
| The single source of truth for Wivae's identity. Nothing in the codebase
| hardcodes the brand name, colours, or domain — everything reads from here.
|
| This is also the white-label mechanism (see docs/ARCHITECTURE.md §8): a
| tenant's `branding` JSONB overrides these defaults at request time. Ship
| brand-as-config now and white-label costs almost nothing later.
|
*/

return [

    // Product name. Used in page titles, emails, receipts, the PWA manifest.
    'name' => env('BRAND_NAME', 'Wivae'),

    'tagline' => env('BRAND_TAGLINE', 'Point of sale that never stops selling.'),

    'support_email' => env('BRAND_SUPPORT_EMAIL', 'support@wivae.com'),

    // Root domain for tenant subdomains: acme.wivae.com -> tenant "acme".
    // Also seeds the session cookie domain and subdomain routing.
    'tenant_domain' => env('APP_TENANT_DOMAIN', 'wivae.test'),

    // Default theme. A tenant's branding row overrides any of these keys.
    'theme' => [
        'primary'    => env('BRAND_PRIMARY', '#1D4ED8'),   // action / brand blue
        'foreground' => env('BRAND_FOREGROUND', '#0F172A'),
        'accent'     => env('BRAND_ACCENT', '#059669'),     // positive / trial
        'logo_url'   => env('BRAND_LOGO_URL', null),
    ],

    // Trial length offered on tenant signup.
    'trial_days' => (int) env('BRAND_TRIAL_DAYS', 7),

];
