<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; color: #0f172a; max-width: 480px; margin: 0 auto; padding: 24px;">
<h2 style="margin-bottom: 4px;">New {{ $package }} enquiry</h2>
<p style="color: #64748b; margin-top: 0;">Submitted {{ $enquiry->created_at->format('d M Y, H:i') }}</p>

<table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr>
        <td style="padding: 6px 0; color: #64748b; width: 120px;">Name</td>
        <td style="padding: 6px 0;">{{ $enquiry->name }}</td>
    </tr>
    <tr>
        <td style="padding: 6px 0; color: #64748b;">Business</td>
        <td style="padding: 6px 0;">{{ $enquiry->business_name }}</td>
    </tr>
    <tr>
        <td style="padding: 6px 0; color: #64748b;">Email</td>
        <td style="padding: 6px 0;"><a href="mailto:{{ $enquiry->email }}">{{ $enquiry->email }}</a></td>
    </tr>
    @if($enquiry->phone)
        <tr>
            <td style="padding: 6px 0; color: #64748b;">Phone</td>
            <td style="padding: 6px 0;">{{ $enquiry->phone }}</td>
        </tr>
    @endif
</table>

@if($enquiry->message)
    <p style="color: #64748b; margin-bottom: 4px; margin-top: 20px;">Message</p>
    <p style="white-space: pre-wrap;">{{ $enquiry->message }}</p>
@endif
</body>
</html>
