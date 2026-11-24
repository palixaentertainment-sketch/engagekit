## Local Setup

Requires Node 20+ and PostgreSQL. Run `npm install` and create a PostgreSQL database. For a new database, apply `server/schema.sql`, then apply both `server/migrations/002_customer_accounts.sql` and `server/migrations/002_api_key_scopes.sql`. For an existing prototype database, apply `server/migrations/001_multi_tenant_foundation.sql` first, then apply both `002` migrations. The two `002` files are separate, independent migrations; apply each once. The account migration requires Supabase Auth's `auth.users` table. Copy `.env.example` to `.env`; set `DATABASE_URL`, a strong `ENGAGEKIT_ADMIN_KEY`, a separate strong `ENGAGEKIT_SETUP_KEY`, and VAPID credentials. Generate VAPID values with `npm run vapid`; never commit the private key. Start the API with `npm start`.

### Create a project

Customer accounts are supported through Supabase Auth. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then customers can register and sign in through the dashboard. Authenticated customers create projects at `POST /v1/account/projects`; project ownership is enforced on project, key, analytics and campaign routes. The legacy founder setup route `POST /v1/projects` remains available only when `ENGAGEKIT_SETUP_KEY` is configured. The API returns two keys once: a public browser key (`ek_pub_...`) and a secret server-side key (`ek_sec_...`). Only SHA-256 hashes are persisted. The public key can be embedded in the browser SDK; the secret key must never be exposed publicly. Slugs must be unique. Disable provisioning by removing `ENGAGEKIT_SETUP_KEY` after initial setup.

Example request body:

```json
{ "name": "My Website", "slug": "my-website", "websiteUrl": "https://example.com" }
```

Use the public key as `x-engagekit-key` for browser event ingestion and push subscription. Use the secret key for server-side integrations. Admin dashboard routes require both `x-engagekit-admin-key` and a secret project key. Never expose the secret key in frontend code.

### Website integration

Deploy `public/engagekit-sw.js` to the website root. Retrieve `GET /v1/push/public-key`; import `subscribeToPush` from `src/web-push.js` and call it after a visitor explicitly clicks a subscribe button. HTTPS is required except on localhost.

### Routes

- `GET /health`
- `GET /v1/push/public-key`
- `POST /v1/projects` (setup key)
- `POST /v1/push/subscribe`, `POST /v1/push/unsubscribe`, `POST /v1/events` (project API key)
- `/v1/admin/*` (admin key plus project API key)

Security status: early beta, not production-ready. Customer authentication depends on Supabase Auth and the customer-ownership migration. Authentication responses use generic client-facing errors to avoid exposing provider details or confirming whether an email is registered; diagnostic details remain in server logs. The legacy setup endpoint should be disabled after any required founder provisioning. Authentication rate limits are process-local and best-effort only; they are not suitable as a distributed production control and must be replaced with shared rate limiting before public launch. Quotas, durable background delivery, abuse monitoring, and an independent security review are still required.


## Deploying the API on Vercel

The repository includes a catch-all Vercel Node function at `api/[...path].js`. Vercel rewrites `/health` and `/v1/*` requests to that function while continuing to serve the static site from `public/`. Add the environment variables listed in `.env.example` to the Vercel project. Use a managed PostgreSQL database and run the appropriate SQL schema or migrations against it before testing the API. Set `ALLOWED_ORIGINS` to a comma-separated list of exact website origins. Set `PGSSL=true` if your database provider requires TLS. The API will not work until `DATABASE_URL`, VAPID keys, admin key and setup key are configured in Vercel.
