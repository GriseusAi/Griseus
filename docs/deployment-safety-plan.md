# Griseus Deployment Safety Plan

Last checked: 2026-05-06

## Current Facts

- Local repo: `/Users/gurkanduruak/Desktop/griseus-main`
- Git remote: `https://github.com/GriseusAi/Griseus.git`
- Active branch: `main`
- GitHub default branch: `main`
- GitHub repo visibility: public
- Latest observed GitHub push: 2026-05-06 18:06:41 UTC
- Local worktree was clean during this check.

## Current Deployment Flow

GitHub deployments show that a push to `main` currently triggers both:

- Vercel Production
  - Latest observed successful deployment URL: `https://griseus-fvja9fy5e-gurkan-duruaks-projects.vercel.app`
  - Deployment creator: `vercel[bot]`
- Railway production
  - Project URL from GitHub deployment status: `https://railway.com/project/3fccb8d2-4588-40aa-ab36-c6b49556c355?environmentId=f68eb6f3-67fc-4b80-ba4a-ff829e1f7b9f`
  - Environment label: `selfless-flexibility / production`
  - Deployment creator: `railway-app[bot]`

No `.vercel` folder, `vercel.json`, GitHub Actions workflow, or local Railway project link was found in the repo. Railway CLI is installed locally, but the local CLI session is not authenticated and the repo is not linked.

## Live Smoke Test

- `https://griseus.io` returned HTTP 200.
- Response headers show `server: railway-edge` and `x-powered-by: Express`, so the live custom domain is currently served by Railway, not by the protected Vercel preview URL.
- `https://griseus.io/api/products` returned 11 active SKU rows.
- `https://griseus.io/api/bom/GSS20P/production-capacity` returned `maxProducible: 232`.
- `https://griseus.io/api/ontology/graph` returned ontology data with 24 object types, 13 link types, 26 action types, and 10 function types.
- `https://griseus.io/api/orchestrator/runs` returned recent audit runs. Latest observed run had 0 red layers and 2 yellow layers.
- The latest observed Vercel deployment URL returned HTTP 401 with Vercel SSO protection.
- After adding `SESSION_SECRET` and deploying the Railway service, smoke tests still passed:
  - `https://griseus.io` returned HTTP 200.
  - `https://griseus.io/api/products` returned 11 active SKU rows.
  - `https://griseus.io/api/bom/GSS20P/production-capacity` returned `maxProducible: 232`.
  - `https://griseus.io/api/orchestrator/runs` returned latest observed audit with 0 red layers and 2 yellow layers.

## Security Changes

- `SESSION_SECRET` was added to the Railway Griseus service on 2026-05-06 after taking a manual database backup.
- The initial value was exposed in assistant chat due clipboard issues. It is still stronger than the previous hardcoded fallback, but it should be rotated from the Railway dashboard when convenient.

## Database Backup Status

- Railway project has a Postgres service.
- The Postgres service exposes `DATABASE_URL` and `DATABASE_PUBLIC_URL`.
- Railway managed backups are not active. The dashboard says backups are only available for customers on the Pro plan and shows no existing backups.
- Before any migration, hosting split, or production env change, take a manual `pg_dump` backup.
- Manual backup taken on 2026-05-06 21:15 Europe/Istanbul:
  - Local file: `backups/griseus-prod-20260506-211528.dump`
  - Size: 1.2 MB
  - Format: PostgreSQL custom dump (`pg_dump --format=custom`)
- Manual backup taken on 2026-05-06 22:17 Europe/Istanbul:
  - Local file: `backups/griseus-prod-20260506-221712.dump`
  - Size: 1.2 MB
  - Format: PostgreSQL custom dump (`pg_dump --format=custom`)
  - Verified with `pg_restore --list`.
- The Railway Postgres public connection URL was exposed in assistant chat during manual backup handoff. Rotate the Postgres password/connection credentials from Railway after confirming backups are retained.
- Repeatable backup command:
  - Run `npm run backup:prod`.
  - Paste the Railway Postgres public `DATABASE_URL` when prompted.
  - The prompt hides input and the script never prints the connection string.
  - Output files are written under ignored `backups/` as PostgreSQL custom dumps.
  - Local prerequisite: `pg_dump` from PostgreSQL client tools. On this Mac it is provided by Homebrew `libpq`.

## Runtime Shape

- Build command: `npm run build`
- Start command from `nixpacks.toml`: `node dist/index.cjs`
- Development command: `npm run dev`
- Server entrypoint: `server/index.ts`
- Client build output: `dist/public`
- Server bundle output: `dist/index.cjs`

The production build and TypeScript check both succeed after the 2026-05-06 type-safety stabilization pass.

## Required Environment Variables

The code references these environment variables:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ORCHESTRATOR_INTERVAL_MIN`
- `ORCHESTRATOR_MODEL`
- `VOYAGE_API_KEY`
- `MAIN_PRODUCT_SKU`
- `NARRATIVE_MODEL`
- `NODE_ENV`
- `PORT`

Do not paste secret values into chat or commit them to git. Verify and copy them only through platform dashboards or CLI secret-management commands.

## Safety Rules

1. Do not change production domain routing until staging passes verification.
2. Do not point staging at the production database.
3. Do not run schema push or migrations against production without a database backup.
4. Do not remove the current Vercel or Railway deployment until the replacement has passed smoke tests.
5. Keep rollback simple: old production deployment remains available until cutover is confirmed.

## Recommended Next Steps

1. Follow `docs/staging-runbook.md`.
2. Create a staging database from a sanitized or copied backup.
3. Create a staging Railway service or environment connected to the staging database.
4. Deploy staging with `APP_ENV=staging`.
5. Run:

```bash
npm run smoke:url -- https://staging-url
```

6. Only after staging passes, decide whether Vercel remains frontend-only and Railway remains core backend.

## Current Recommendation

Keep the hybrid deployment model:

- Vercel: frontend and preview deployments
- Railway or another long-running service: Express API, WebSocket, schedulers, workers
- Postgres: source of truth
- Redis/queue later: background jobs and orchestration
