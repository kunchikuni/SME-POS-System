<?php

/**
 * Where Business-tier enquiry notifications go. A dedicated file rather
 * than adding to config/mail.php — that file was never in this sandbox
 * (a framework default, like config/auth.php), so creating or editing it
 * here risks clobbering whatever real mail-driver configuration already
 * exists there. This keeps the one new setting this feature needs fully
 * separate and safe to ship alongside it.
 *
 * If SALES_EMAIL isn't set, EnquiryController simply skips sending the
 * notification — the enquiry itself is still saved either way.
 */
return [
    'sales_email' => env('SALES_EMAIL'),
];
