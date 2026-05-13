# Griseus Staging Runbook

Last updated: 2026-05-13

## Goal

Staging is a full copy of the Griseus app that can be tested before touching production.

Staging must have its own:

- Railway environment or service
- PostgreSQL database
- `DATABASE_URL`
- `SESSION_SECRET`
- Postgres-backed Express session table
- public deployment URL

Staging may reuse non-data API keys such as Anthropic, Voyage, and Resend if cost and quota are acceptable, but production data must not be written by staging.

## Current Production Baseline

- Production domain: `https://griseus.io`
- Production runtime: Railway
- Production database: Railway Postgres
- Production branch: `main`
- Staging branch: `staging`
- Production smoke command:

```bash
npm run smoke:url -- https://griseus.io
```

## Safe Setup Order

1. Keep production unchanged.
2. Create a Railway environment named `staging`, or create a separate Railway service/project named `Griseus Staging`.
   - Connect it to the GitHub branch `staging`.
   - Keep the production Railway service connected to `main`.
3. Add a new Railway Postgres service for staging.
4. Restore a copy of the latest local backup into the staging Postgres database.

```bash
npm run restore:staging
```

The command prompts for the staging `DATABASE_PUBLIC_URL` with hidden input and asks for a `STAGING` confirmation before modifying the target database.

5. Set staging service variables:

```text
APP_ENV=staging
NODE_ENV=production
DATABASE_URL=<staging postgres url>
SESSION_SECRET=<new staging-only random secret>
ANTHROPIC_API_KEY=<existing or staging key>
VOYAGE_API_KEY=<existing or staging key>
RESEND_API_KEY=<existing or staging key>
TZ=Europe/Istanbul
```

6. Deploy staging.
7. Run:

```bash
npm run smoke:url -- https://staging-url
```

8. Only after smoke tests pass, use staging for risky feature work, migrations, and hosting experiments.

## Production Safety Rules

- Do not point staging at the production `DATABASE_URL`.
- Do not paste database URLs or API keys into docs, commits, screenshots, or chat.
- Take `npm run backup:prod` before any production migration or hosting cutover.
- Run migrations against staging before production.
- If staging uses copied production data, treat it as sensitive.
- Do not change `griseus.io` routing until staging passes smoke tests.

## Migration Discipline

Schema changes must be represented as SQL files under `migrations/` and applied through the migration ledger, not by ad hoc production edits.

Use this order:

1. Add the migration file, for example `migrations/0012_pg_sessions.sql`.
2. Check pending migrations without changing the database:

```bash
DATABASE_URL=<staging postgres url> APP_ENV=staging npm run db:migrate:dry
```

3. Apply to staging:

```bash
DATABASE_URL=<staging postgres url> APP_ENV=staging npm run db:migrate
```

4. Smoke test staging.
5. Back up production:

```bash
npm run backup:prod
```

6. Apply to production only after backup and staging verification:

```bash
DATABASE_URL=<production postgres url> APP_ENV=production ALLOW_PRODUCTION_MIGRATIONS=1 npm run db:migrate
```

For an existing database whose historical migrations were already applied manually, run `npm run db:migrate:baseline` once to record that baseline without executing old SQL.

## Smoke Test Coverage

The smoke command checks:

- `/api/health`
- `/api/products`
- `/api/bom/GSS20P/production-capacity`
- `/api/orchestrator/latest`

This proves the app boots, can reach Postgres, can read core product/BOM data, and can read the latest orchestrator state.

## Manual Browser Checks

After the smoke command passes, open the staging URL and check:

- Login screen loads.
- Home/dashboard loads after login.
- Strategy canvas opens.
- Stock pages open.
- Agent panel opens only when requested.

## Rollback

If staging fails, do not touch production. Fix staging, redeploy staging, and rerun the smoke command.
