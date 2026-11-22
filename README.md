# EngageKit

Web Push notifications and engagement tools for websites. Early prototype for collecting events and delivering native browser push notifications to subscribed visitors.

## Included
- JavaScript SDK: identify/track, queue, listeners and callback rules
- HTTP event adapter
- Node/Express API with PostgreSQL persistence
- VAPID key generator
- Browser subscription helper and service worker
- Static dashboard for subscriber overview and sending push campaigns

## Quick start

Prerequisites: Node.js 20+ and a PostgreSQL database.

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `ENGAGEKIT_ADMIN_KEY`, and your allowed website origins.
3. Generate VAPID keys:
   ```bash
   npm run vapid
   ```
   Put the generated public/private keys and a mailto VAPID subject in `.env`.
4. Create the database tables:
   ```bash
   npm run db:setup
   ```
   This runs `server/schema.sql` against the configured database. Alternatively, run `psql "$DATABASE_URL" -f server/schema.sql`.
5. Start the API:
   ```bash
   npm start
   ```
6. Confirm it is running at `GET /health` (should return `{"ok":true}`).

## Web Push setup

Serve `public/engagekit-sw.js` from the website's root over HTTPS so its service-worker scope can cover the site. Fetch `GET /v1/push/public-key`, then call `subscribeToPush({apiUrl,publicKey})` from the browser on a user-initiated action. Notification permission must be granted by the visitor. Web Push delivery requires VAPID keys and a valid saved subscription.

## API routes

- `GET /health`
- `GET /v1/push/public-key`
- `POST /v1/push/subscribe`
- `POST /v1/push/unsubscribe`
- `POST /v1/events`
- Admin endpoints: `GET /v1/admin/overview`, `GET /v1/admin/subscribers`, `GET /v1/admin/events`, `POST /v1/admin/push/send` (header `x-engagekit-admin-key`).

## Security and production readiness

Prototype only. Event ingestion is currently unauthenticated (the SDK adapter's `apiKey` header is not validated by the API); the admin uses a shared key; public subscription endpoints lack robust abuse/endpoint validation; there is no rate limiting, tenant/project isolation, push queue/retry, or audit logging. Treat the event adapter key as a public client identifier, not a secret. Before production add proper authentication, tenant separation, key rotation, request limits, abuse protection, SSRF safeguards, logging/auditing, queued delivery/retries and a security review. Never commit `.env` or VAPID private keys.
