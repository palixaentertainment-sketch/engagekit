# EngageKit

Web Push notifications and engagement tools for websites. EngageKit is an early-stage project; the hosted URL currently serves a static preview.

## Included
- JavaScript SDK and event adapter
- Node/Express API prototype with project-scoped API-key authentication
- PostgreSQL multi-project schema and migration
- One-time project provisioning and API-key generation (founder setup key)
- VAPID key generator and browser service worker
- Static dashboard preview

## Database

For a new database, apply `server/schema.sql`. To upgrade the original single-project prototype, apply `server/migrations/001_multi_tenant_foundation.sql`. The migration preserves existing subscribers and events by assigning them to **Legacy EngageKit project**. PostgreSQL must permit creation of the `pgcrypto` extension.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and configure PostgreSQL, separate admin/setup secrets, and VAPID keys.
3. Run `npm run vapid` to generate VAPID credentials.
4. Apply the schema or migration as appropriate.
5. Run `npm start`.
6. Provision a project using `POST /v1/projects` with `x-engagekit-setup-key`. The raw project API key is returned once; store it securely.

See `docs/SETUP.md` for endpoint and integration details.

## Current limitations

The Vercel configuration now includes a serverless API entrypoint alongside the static preview. It is not a functioning production API until a PostgreSQL database and all required environment variables are configured in Vercel. Project provisioning is founder-only; customer accounts, billing, key rotation UI, rate limiting, quotas, and background campaign delivery are not implemented. Public browser keys are separate from secret server-side keys. Do not expose privileged API keys in browser code or use this prototype for production subscriber data until deployment and security work are complete.

Never commit `.env`, raw API keys, database credentials, or VAPID private keys.
