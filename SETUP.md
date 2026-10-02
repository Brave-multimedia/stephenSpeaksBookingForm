# Stephen Speaks booking backend

This repo is connected to Cloudflare Pages. Production deploys from `main`; use a non-production branch and its Pages preview while configuring the backend. Do not bind this feature to the separate `brave-inquiries` database used by another system.

## Create and connect the dedicated D1 database

1. In Cloudflare, create a new D1 database named `stephen-speaks-bookings`.
2. Open that database's SQL console and run `migrations/0001_create_booking_inquiries.sql`, then `migrations/0002_add_customer_edit_links.sql`.
3. Create a second D1 database for previews, such as `stephen-speaks-bookings-preview`, and run both migrations there. This keeps test records out of production.
4. Open Workers & Pages → `stephenspeaksbookingform` → Settings → Functions → D1 database bindings. Add a binding named `BOOKINGS_DB`; select the production database for Production and the preview database for Preview. Redeploy the project after changing bindings.

The public submission endpoint is `/api/submit-inquiry`. It saves the submitted responses, starts the inquiry at `New`, applies a small per-IP rate limit, and emails the customer a confirmation with a private view/edit link. After the database save succeeds, the existing FormSubmit flow continues to send the full inquiry to `connect@bravemultimedia.com`. Customer edit links are stored as hashes and expire 30 days after submission. If the database is unavailable, the browser falls back to FormSubmit so the team can still receive the inquiry. If the request is invalid or over the rate limit, it asks the visitor to correct or retry rather than forwarding the rejected request.

## Configure confirmation emails

1. Create a Resend account and add a sending subdomain such as `notify.bravemultimedia.com`. Add only the DNS records Resend provides for that subdomain in Cloudflare; do not replace the existing Google Workspace MX or SPF records for `bravemultimedia.com`.
2. Verify the sending domain in Resend, then create an API key.
3. In Cloudflare Pages Variables and secrets, set `RESEND_API_KEY` as a secret and `BOOKING_EMAIL_FROM` as a text variable such as `Stephen Speaks Bookings <bookings@notify.bravemultimedia.com>`. Set both in Preview and Production.
4. Resend's Free plan currently includes 3,000 transactional emails per month with a 100-per-day limit. Each successful inquiry uses one Resend email for the customer's confirmation; the existing FormSubmit flow continues to notify Connect. ([Resend pricing](https://resend.com/pricing))

## Protect and configure the staff dashboard

1. In Cloudflare Zero Trust, create Access applications for `booking.bravemultimedia.com/admin*` and `booking.bravemultimedia.com/api/admin*`. In each application, use an Allow policy for only `admin@bravemultimedia.com`. Customers can still use the public booking form without signing in.
2. In the Pages project's environment variables, set `ACCESS_TEAM_DOMAIN` to the Access team's hostname (for example, `your-team.cloudflareaccess.com`) and `ACCESS_AUD` to the Access application's audience tag. Add these for Production and Preview.
3. Add a randomly generated `RATE_LIMIT_SECRET` as a secret for Production and Preview. Use different values in each environment.
4. Confirm the Pages deployment contains Functions from the repository root. Cloudflare maps `functions/api/submit-inquiry.ts` to `/api/submit-inquiry` and `functions/api/admin/inquiries.ts` to `/api/admin/inquiries`.

The Access applications protect both the dashboard page and its API. The API verifies the signed Cloudflare Access JWT, its audience, issuer, and expiry, and only accepts `admin@bravemultimedia.com` before returning inquiry records or allowing status changes. The public form submission endpoint remains outside Access so customers do not need to sign in.

## Meeting calendar

Create an appointment schedule while signed in to Google Calendar as `admin@bravemultimedia.com`. Share its calendar with the `connect@bravemultimedia.com` Google Group and add the group as a co-host if Workspace makes that option available. Copy the schedule booking-page URL into `calendarBookingUrl` in `config.js`.

The meeting schedule is separate from proposed performance dates. A performance date on an inquiry is not placed on the artist calendar until staff approve it.

## Preview and release

Deploy the feature branch as a Pages preview and use the preview D1 binding for sample submissions. Confirm a new inquiry appears as `New`, only `admin@bravemultimedia.com` can access the staff dashboard, a customer receives a confirmation and can edit responses through the private link, the Connect notification arrives, and a database outage uses the email fallback. After that flow is confirmed, merge to `main`; Cloudflare Pages will deploy production automatically.
