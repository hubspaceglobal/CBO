# send-fiscal-email — Edge Function

Sends two emails whenever a fiscal sponsorship / grant proposal application is submitted from `fiscal_apply.html`:

1. **Confirmation** → the applicant's email address
2. **Notification** → `hubspace@theartisanhub.space`

Emails are delivered through [Resend](https://resend.com).

## One-time setup

1. **Create a Resend account** and verify the sending domain (`theartisanhub.space`) so emails come from `noreply@theartisanhub.space`. For quick testing you can use the default `onboarding@resend.dev` sender.

2. **Set the function secrets** (from the repo root, with the Supabase CLI installed and `supabase login` done):

   ```bash
   supabase link --project-ref qummleodrnuyudauxnpa
   supabase secrets set RESEND_API_KEY=re_your_key_here
   supabase secrets set FROM_EMAIL="CBO HubSpace <noreply@theartisanhub.space>"
   ```

3. **Deploy the function** (no JWT required — the public form calls it with the anon key):

   ```bash
   supabase functions deploy send-fiscal-email --no-verify-jwt
   ```

The function will be live at:

```
https://qummleodrnuyudauxnpa.supabase.co/functions/v1/send-fiscal-email
```

This is exactly the URL `fiscal_apply.html` calls after saving the application row.

## Notes

- The application is **saved to the database first**; the email call is best-effort, so a missing/undeployed function never blocks a submission.
- If `RESEND_API_KEY` is not set, the function returns `200` and simply skips sending (logged as a warning) — handy while testing.
- Payment links are still sent **manually** within 24–48 hours after approval; this function only sends the confirmation + internal notification.
