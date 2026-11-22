# EngageKit

Web Push notifications and engagement tools for websites. Early prototype for collecting events and delivering native-style browser push notifications to subscribed visitors.

## Included
- JavaScript SDK: identify/track, queue, listeners and callback rules
- HTTP event adapter
- Node/Express API with PostgreSQL persistence
- VAPID key generator
- Browser subscription helper and service worker
- Static dashboard for subscriber overview and sending push campaigns

## Quick start
1. Install Node.js 20+ and PostgreSQL.
2. Run `npm install`.
3. Apply schema: `psql "$DATABASE_URL" -f server/schema.sql`.
4. Copy `.env.example` to `.env` and configure secrets/database.
5. Run `npm run vapid` and copy generated keys to .env.
6. Start API with `npm start`.

## Web Push
Deploy `public/engagekit-sw.js` at the website root over HTTPS. Fetch `GET /v1/push/public-key` then use `subscribeToPush({apiUrl,publicKey})` on a user-initiated action. User permission is required.

## API routes
- GET /health
- GET /v1/push/public-key
- POST /v1/push/subscribe
- POST /v1/push/unsubscribe
- POST /v1/events
- Admin endpoints: GET /v1/admin/overview, GET /v1/admin/subscribers, GET /v1/admin/events, POST /v1/admin/push/send (header x-engagekit-admin-key).

## Security warning
Prototype only. Event ingest is unauthenticated; admin uses a shared key; public subscribe endpoint lacks robust abuse/endpoint validation; no rate limiting or multi-tenant project isolation; campaigns are synchronous. Before production add proper authentication, tenant separation, key rotation, request limits, queue/retries, abuse protection, endpoint SSRF safeguards, logging/auditing and security review. Never commit .env or VAPID private key.