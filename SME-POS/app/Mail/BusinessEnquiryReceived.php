<?php

namespace App\Mail;

use App\Models\Enquiry;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Notifies the sales inbox of a new Business or Enterprise enquiry — which
 * one is computed in build() below and reflected in both the subject line
 * and the email heading. This is deliberately best-effort, not the source
 * of truth — the Enquiry row in the database is that. See
 * EnquiryController: sending this is wrapped in a try/catch, because a
 * fresh install with no MAIL_* configured shouldn't turn a working enquiry
 * submission into a 500 error. If this never arrives, the enquiry is still
 * safely stored and queryable.
 */
class BusinessEnquiryReceived extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Enquiry $enquiry)
    {
    }

    public function build(): self
    {
        $package = match ($this->enquiry->interested_in) {
            'enterprise' => 'Enterprise',
            'business'   => 'Business',
            default      => 'General',
        };

        return $this
            ->subject("New {$package} enquiry — {$this->enquiry->business_name}")
            ->view('emails.business-enquiry', ['package' => $package]);
    }
}
