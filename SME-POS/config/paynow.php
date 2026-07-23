<?php

/**
 * Wivae's own Paynow integration — subscription billing ONLY (docs
 * §9.1). Never used for in-store customer payments; those stay as tender
 * labels on sales. Integration ID/Key come from Paynow (developer portal),
 * set per-environment via .env, never committed.
 *
 * PRICING MODEL: software and hardware are deliberately decoupled, not
 * bundled into a single price. The original bundled model (Standard/Pro as
 * a one-time $170/$200 covering hardware + software) didn't survive contact
 * with real hardware cost research — a 10" tablet + Bluetooth printer alone
 * runs $110-190 in landed COGS before Zimbabwe import duty, freight, or any
 * margin, which a one-time $170 charge can't safely absorb. Splitting them:
 *   - `plans` are pure recurring software subscriptions, differentiated by
 *     real capability (branch count, Fiscalisation, Payroll) — no hardware
 *     cost risk baked in, so the margin math stays simple and honest.
 *   - `hardware` bundles are one-time add-ons, priced to actually cover
 *     landed cost + a real margin, purchasable against ANY software tier
 *     (including BYOD, for a customer who wants to buy hardware from Wivae
 *     without a bundle discount forcing them into a specific software tier).
 *
 * Hardware prices carry real uncertainty pending confirmed Zimbabwe import
 * duty rates — treat as a working estimate with a buffer built in, not a
 * final number. All amounts in whole USD (Paynow's SDK takes decimal
 * amounts, not cents — see PaynowService).
 */
return [
    'integration_id'  => env('PAYNOW_INTEGRATION_ID'),
    'integration_key' => env('PAYNOW_INTEGRATION_KEY'),

    'plans' => [
        'byod'     => [
            'label'      => 'BYOD',
            'price'      => 30,
            'recurring'  => true,
            'branches'   => 1,
            'best_for'   => 'A single counter, testing the waters, or already own a tablet and printer.',
            'features'   => ['Core POS', 'Inventory', 'Staff management', 'Basic reports'],
        ],
        'standard' => [
            'label'      => 'Standard',
            'price'      => 50,
            'recurring'  => true,
            'branches'   => 3,
            'best_for'   => 'A growing shop or restaurant running up to a few branches.',
            'features'   => ['Everything in BYOD', 'AI Insights', 'Task management'],
        ],
        'premium'  => [
            'label'      => 'Premium',
            'price'      => 80,
            'recurring'  => true,
            'branches'   => null, // unlimited
            'best_for'   => 'Multiple branches, staff on payroll, and ZIMRA compliance from day one.',
            'features'   => ['Everything in Standard', 'Payroll & HR', 'Fiscalisation included', 'Priority support'],
        ],
    ],

    // Fiscalisation is a standalone add-on for BYOD/Standard; Premium
    // includes it in the base price (see 'features' above) rather than
    // charging it twice.
    'zimra_addon_price' => 20,

    'hardware' => [
        'tablet_10' => [
            'label' => '10" Android tablet + Bluetooth thermal printer',
            'price' => 220,
        ],
        'tablet_12' => [
            'label' => '12" Android tablet + Bluetooth thermal printer',
            'price' => 280,
        ],
    ],

    /**
     * The Business tier — deliberately NOT part of `plans` above. It isn't
     * a fixed self-serve price: a Windows laptop and professional
     * installation vary too much (laptop spec, site visit distance, existing
     * infrastructure) to quote honestly with one number the way BYOD/
     * Standard/Premium can. This never touches BillingController's Paynow
     * flow at all — its CTA leads to EnquiryController instead, which stores
     * a real quote request rather than attempting to charge anything.
     */
    'business_tier' => [
        'label'      => 'Business',
        'best_for'   => 'Larger operations wanting a full Windows setup and hands-on installation.',
        'features'   => ['Everything in Premium', 'Windows laptop included', 'Professional on-site installation', 'Dedicated onboarding'],
    ],
];
