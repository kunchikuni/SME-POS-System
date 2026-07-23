<?php

/**
 * Wivae's own Paynow integration — subscription billing ONLY (docs
 * §9.1). Never used for in-store customer payments; those stay as tender
 * labels on sales. Integration ID/Key come from Paynow (developer portal),
 * set per-environment via .env, never committed.
 *
 * PRICING MODEL: hardware is bundled into Standard and Premium as part of
 * the RECURRING price — this is a different model from an earlier one that
 * was deliberately undone, not a reversal of the same mistake. That earlier
 * model tried to cover hardware cost with a ONE-TIME payment, which fails
 * the moment a customer churns right after signup — there's no more revenue
 * coming to make up the loss. A recurring plan that includes hardware
 * amortizes that cost over the subscription's actual lifetime instead — the
 * same model phone carriers use for a "free" handset on a contract. Prices
 * below are raised specifically to reflect this:
 *   - Standard (+$15/mo over the hardware-free price) recoups a 10" tablet +
 *     printer's ~$110-190 landed cost within roughly 8-13 months of the
 *     subscription continuing — not immediately, but safely over time.
 *   - Premium (+$20/mo) does the same for a 12" tablet + printer's
 *     ~$140-200 landed cost.
 * BYOD stays hardware-free and unchanged — "bring your own device" is the
 * whole point of that tier. The standalone `hardware` bundles below still
 * exist for a BYOD customer who wants to buy from Wivae anyway, or a
 * Standard customer who wants the bigger 12" tablet without upgrading to
 * Premium — not everyone's hardware need maps neatly to their software tier.
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
            'price'      => 29.99,
            'recurring'  => true,
            'branches'   => 1,
            'best_for'   => 'A single counter, testing the waters, or already own a tablet and printer.',
            'features'   => ['Core POS', 'Inventory', 'Staff management', 'Basic reports', 'Offline first', 'Cloud synchronization'],
        ],
        'standard' => [
            'label'      => 'Standard',
            'price'      => 180,
            'recurring'  => false,
            'branches'   => 5,
            'best_for'   => 'A growing shop or restaurant running up to a few branches.',
            'features'   => ['Everything in BYOD', '10" Android tablet + Bluetooth thermal printer included','Providing intensive before and after implementation training to ensure in-depth system product knowledge and use', 'Configured-Ready to go', 'AI Insights', 'Task management'],
        ],
        'premium'  => [
            'label'      => 'Premium',
            'price'      => 199.9,
            'recurring'  => false,
            'branches'   => null, // unlimited
            'best_for'   => 'Multiple branches, staff on payroll, and ZIMRA compliance from day one.',
            'features'   => ['Everything in Standard', '12" Android tablet (upgraded)', 'Payroll & HR', 'Fiscalisation included', 'Priority support','Ongoing training to reinforce learning and build proficiency','Implementation planning to ensure the roles of both parties are clearly defined'],
        ],
    ],

    // Fiscalisation is a standalone add-on for BYOD/Standard; Premium
    // includes it in the base price (see 'features' above) rather than
    // charging it twice.
    'zimra_addon_price' => 20,

    // Still available standalone — see the docblock above for who this is
    // actually for now that Standard/Premium include their own tablet.
    'hardware' => [
        'tablet_10' => [
            'label' => '10" Android tablet + Bluetooth thermal printer',
            'price' => 120,
        ],
        'tablet_12' => [
            'label' => '12" Android tablet + Bluetooth thermal printer',
            'price' => 180,
        ],
    ],

    /**
     * Business and Enterprise — deliberately NOT part of `plans` above.
     * Neither is a fixed self-serve price: Business varies with laptop spec
     * and install distance; Enterprise is explicitly bespoke (multi-location
     * chains with custom integration needs). Neither touches
     * BillingController's Paynow flow — both CTAs lead to EnquiryController
     * instead, which stores a real quote request rather than attempting to
     * charge anything. `enquiries.interested_in` records which one a lead
     * came from.
     */
    'business_tier' => [
        'label'       => 'Business Package',
        'description' => 'Windows laptop + business POS printer + swipe machine POS terminal + full system access. The complete counter-ready bundle for serious retail operations.',
        'features'    => ['Windows laptop', 'Implementation planning to ensure the roles of both parties are clearly define', 'Full WivaePOS license', 'Card swipe / POS terminal machine', 'Desktop thermal/impact printer', 'Continuous product upgrades – with consideration of input from our client base and monitoring developments in a fast-evolving retail landscape'],
    ],
    'enterprise_tier' => [
        'label'       => 'Enterprise Package',
        'description' => 'Custom solution designed for chain stores, franchises, and multi-location businesses. Built to your exact operational requirements.',
        'features'    => ['Custom device & hardware configuration', 'Dedicated cloud infrastructure'],
    ],
];


//['Custom device & hardware configuration', 'White-label branding included', 'Custom integrations & API access', 'Dedicated cloud infrastructure', 'Unlimited branches & locations', 'SLA-backed enterprise support'],
