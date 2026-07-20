<?php

/**
 * Wivae's own Paynow integration — subscription billing ONLY (docs
 * §9.1). Never used for in-store customer payments; those stay as tender
 * labels on sales. Integration ID/Key come from Paynow (developer portal),
 * set per-environment via .env, never committed.
 *
 * Plan prices confirmed from the product pricing already recorded in this
 * project (Phase 0/1 planning): BYOD is the recurring plan; Standard/Pro are
 * once-off. All amounts in whole USD (Paynow's SDK takes decimal amounts, not
 * cents — see PaynowService).
 */
return [
    'integration_id'  => env('PAYNOW_INTEGRATION_ID'),
    'integration_key' => env('PAYNOW_INTEGRATION_KEY'),

    'plans' => [
        'byod'     => ['label' => 'BYOD', 'price' => 30, 'recurring' => true],
        'standard' => ['label' => 'Standard', 'price' => 170, 'recurring' => false],
        'pro'      => ['label' => 'Pro', 'price' => 200, 'recurring' => false],
    ],
    'zimra_addon_price' => 20,
];
