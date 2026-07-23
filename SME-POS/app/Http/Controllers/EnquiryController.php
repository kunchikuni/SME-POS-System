<?php

namespace App\Http\Controllers;

use App\Mail\BusinessEnquiryReceived;
use App\Models\Enquiry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * "Enquire for a quote" for the Business and Enterprise tiers — neither is a
 * fixed self-serve price, so both land here instead of the real Paynow
 * billing flow. interested_in records which tier prompted the submission.
 */
class EnquiryController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:120'],
            'business_name' => ['required', 'string', 'max:120'],
            'interested_in' => ['nullable', 'in:business,enterprise'],
            'email'         => ['required', 'email', 'max:190'],
            'phone'         => ['nullable', 'string', 'max:30'],
            'message'       => ['nullable', 'string', 'max:2000'],
        ]);

        $enquiry = Enquiry::create($data);

        // Best-effort: the enquiry is already safely stored above regardless
        // of whether this succeeds. A fresh install with no MAIL_* configured
        // (the default — this project has never sent an email before this
        // feature) shouldn't turn a working submission into a 500. If this
        // fails, the enquiry is still queryable — it isn't lost.
        try {
            $salesEmail = config('enquiries.sales_email');
            if ($salesEmail) {
                Mail::to($salesEmail)->send(new BusinessEnquiryReceived($enquiry));
            }
        } catch (\Throwable $e) {
            Log::warning('Business enquiry saved but notification email failed to send.', [
                'enquiry_id' => $enquiry->id,
                'error'      => $e->getMessage(),
            ]);
        }

        return back()->with('flash', 'Thanks — we\u2019ve got your details and will be in touch shortly.');
    }
}
