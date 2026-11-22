# EngageKit

EngageKit is a self-service website engagement platform for browser push notifications and event tracking.

## Customer workspace

The responsive dashboard at `/dashboard.html` now includes:
- Email/password account registration, sign-in and password-reset email requests through Supabase Auth.
- Customer-owned website projects with strict owner checks on every project-management route.
- Project overview metrics, subscriber list, recent events, campaign history and CSV exports.
- Push notification composer and delivery results.
- API key creation and revocation; raw keys are returned only at creation time.
- Project settings and permanent project deletion.
- Website integration guidance and mobile-friendly navigation.

## Deployment requirements

Use Node 20+, Vercel, Supabase Auth and a PostgreSQL database. Set these Vercel environment variables:

- `DATABASE_URL`: Supabase Transaction Pooler connection string (use the correct pooler mode/port).
- `PGSSL=true` when required by the database provider.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: Supabase publishable/anon key (never use the service-role key here).
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: a matching VAPID key pair generated with `npm run vapid`.
- `VAPID_SUBJECT`: a valid mailto contact for push delivery.
- `ALLOWED_ORIGINS`: comma-separated trusted EngageKit dashboard origins. Customer project origins are also checked against the website URL saved on each project.
- `ENGAGEKIT_ADMIN_KEY` and `ENGAGEKIT_SETUP_KEY`: legacy administrative provisioning secrets. Rotate any values previously shared in chat.

Configure Supabase Auth:
1. Enable Email provider.
2. Set the production Site URL to the deployed EngageKit origin.
3. Configure allowed redirect URLs for password recovery.
4. Choose whether email confirmation is required.

## Database setup

For a new database, apply `server/schema.sql`, then apply:
- `server/migrations/002_customer_accounts.sql`

For an existing prototype database, first apply `server/migrations/001_multi_tenant_foundation.sql` if it has not already been applied, then apply `002_customer_accounts.sql`.

The account migration adds `projects.owner_id` referencing `auth.users`. Existing founder projects remain unowned until explicitly assigned. Do not expose legacy projects to customer accounts without reviewing ownership.

## Local setup

1. Run `npm install`.
2. Configure the environment variables above in `.env`.
3. Generate VAPID credentials with `npm run vapid`.
4. Apply the database schema and migrations.
5. Run `npm start`.
6. Open `/dashboard.html`.

## Website integration

A project uses a public key in browser code for push subscription and event ingestion. Secret keys are for trusted server-side integrations only.

1. Add `public/engagekit-sw.js` to the root of the customer website as `/engagekit-sw.js`.
2. Fetch `GET /v1/push/public-key` from the EngageKit API to obtain the VAPID public key.
3. Use the public project API key with `x-engagekit-key` for `POST /v1/push/subscribe`, `POST /v1/push/unsubscribe` and `POST /v1/events`.
4. Ask for notification permission only after a visitor actively clicks a subscribe button.
5. Save the website URL in project settings so browser-origin checks can validate the customer site.

HTTPS is required for browser push except on localhost.

## Security and operational status

This is an early-stage SaaS implementation, not a claim of production certification. Authentication endpoints have basic per-instance throttling; production should add a shared rate-limit store, abuse monitoring, secure session cookies or a hardened token lifecycle, automated backups, billing/quotas, audit logs, and queued campaign delivery for large audiences. The dashboard currently stores Supabase access tokens in localStorage; do not treat that as an ideal long-term production session design. Review the database schema, environment variables and live deployment before inviting paying customers.

Never commit `.env`, database credentials, raw API keys, Supabase service-role keys or VAPID private keys.
