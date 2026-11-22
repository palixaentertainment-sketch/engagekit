## Local Setup

Requires Node 20+ and PostgreSQL. Run `npm install`, create a PostgreSQL database, and apply `server/schema.sql` (new database) or `server/migrations/001_multi_tenant_foundation.sql` (existing prototype database). Copy `.env.example` to `.env`; set `DATABASE_URL`, a strong `ENGAGEKIT_ADMIN_KEY`, a separate strong `ENGAGEKIT_SETUP_KEY`, and VAPID credentials. Generate VAPID values with `npm run vapid`; never commit the private key. Start the API with `npm start`.

### Create a project

Project provisioning is currently founder-operated; customer accounts and self-service billing are not implemented. Send a `POST /v1/projects` request with the `x-engagekit-setup-key` header and JSON fields `name`, `slug`, and optional `websiteUrl` / `keyName`. The API returns two keys once: a public browser key (`ek_pub_...`) and a secret server-side key (`ek_sec_...`). Only SHA-256 hashes are persisted. The public key can be embedded in the browser SDK; the secret key must never be exposed publicly. Slugs must be unique. Disable provisioning by removing `ENGAGEKIT_SETUP_KEY` after initial setup.

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

Security status: early prototype, not production-ready. The hosted Vercel URL is a static preview; the API is not deployed or connected to a production database. Rate limits, customer authentication, project key rotation/revocation UI, quotas, background delivery, and a security review are still required.
