<?php

/**
 * ZIMRA Fiscal Device Gateway API environment addresses — confirmed from the
 * official spec (Fiscal Device Gateway API Specification v7.2, §7.2
 * "Environment addresses"), fetched directly from zimra.co.zw on 2026-07-19.
 * Not guessed, not from training-data memory.
 */
return [
    'test' => [
        'base_url' => 'https://fdmsapitest.zimra.co.zw',
    ],
    'production' => [
        'base_url' => 'https://fdmsapi.zimra.co.zw',
    ],

    /**
     * The literal endpoint PATHS below are the one piece of the spec NOT
     * confirmed from a primary source — the official PDF documents field
     * names, headers, and payloads for every endpoint but not the exact REST
     * paths (those live in FDMS's Swagger UI, which loads its spec via JS
     * this environment can't execute). Do not trust these paths without
     * confirming them against https://fdmsapitest.zimra.co.zw/swagger/index.html
     * first — verifyTaxpayerInformation is the only one this build calls, and
     * it's built to fail loudly (not silently) if the path is wrong.
     */
    'paths' => [
        'verify_taxpayer_information' => '/Public/v1/verifyTaxpayerInformation',
    ],
];
