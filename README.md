# EngageKit

Web Push notifications and engagement tools for websites. EngageKit is an early-stage project; the hosted URL currently serves a static preview.

## Included
- JavaScript SDK and event adapter
- Node/Express API prototype
- PostgreSQL schema and migration
- VAPID key generator and browser service worker
- Static dashboard preview

## Database foundation

The schema is designed for multiple customer websites (projects). Each project owns its API keys, subscribers, events, and campaigns. API keys must be stored as hashes; only show a newly generated raw key once.

For a new database, apply `server/schema.sql`. To upgrade a database created by the original single-project prototype, apply `server/migrations/001_multi_tenant_foundation.sql`. The migration preserves existing subscribers and events by assigning them to a project named **Legacy EngageKit project**.

Prerequisites: PostgreSQL with permission to create the `pgcrypto` extension.

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure `DATABASE_URL`.
3. Generate VAPID keys: `npm run vapid`.
4. Apply the schema: `npm run db:setup` (new database), or run the migration SQL manually for an existing database.
5. Start the prototype API: `npm start`.

## Important status

The current hosted Vercel deployment is a static preview, not a production API. The existing Express routes have not yet been converted to serverless handlers or wired to project-scoped API-key authentication. Do not use this prototype to store production subscriber data or send customer campaigns until that backend work and a security review are complete.

Never commit `.env`, raw API keys, database credentials, or VAPID private keys.
