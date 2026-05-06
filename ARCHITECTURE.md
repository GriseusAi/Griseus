# Griseus Architecture

Last updated: 2026-05-06

## Production Shape

Griseus currently runs as a single full-stack TypeScript application.

- Frontend: React 18, Vite, Wouter, TanStack Query
- Backend: Express, Node.js, WebSocket
- Database: PostgreSQL on Railway, with pgvector enabled
- ORM: Drizzle
- AI services: Anthropic and Voyage API integrations
- Production domain: `https://griseus.io`

## Hosting Decision

Keep the hybrid model, but treat Railway as the current production source of truth.

- Railway:
  - Serves `griseus.io`
  - Runs the Express backend
  - Serves the Vite-built frontend from `dist/public`
  - Runs WebSocket, schedulers, and long-running backend work
  - Hosts the production Postgres service
- Vercel:
  - Receives GitHub deployments
  - Useful for preview/frontend-only checks
  - Not the current production custom-domain runtime

Do not move production routing or split services until a staging environment exists.

## Runtime Flow

1. A push to `main` triggers GitHub deployments.
2. Railway builds the app with `npm run build`.
3. Railway starts the server with `node dist/index.cjs`.
4. Express serves API routes, WebSocket endpoints, and frontend static assets.
5. Frontend API calls use the same origin, so `griseus.io/api/...` reaches the Railway backend.

The `staging` GitHub branch exists for a separate Railway staging environment. Production should remain on `main`.

## Data Safety

- Production DB backups live locally under ignored `backups/`.
- Use `npm run backup:prod` before migrations, hosting changes, or risky production env changes.
- Backup files must not be committed.
- Railway managed backups are not active on the current plan.

## Environment Variables

Production service variables are managed in Railway.

Required core variables:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`
- `RESEND_API_KEY`
- `TZ`

Never commit env values or paste them into docs.

## Performance Notes

The frontend uses route-level lazy loading for heavy operational surfaces.

- Initial app bundle keeps home/login/base shell available.
- Heavy pages such as ontology, BH ontology, stock screens, admin, and agent panel load on demand.
- Agent panel is delayed until first open because it pulls diagram rendering dependencies.
- Chart modal dependencies load only when diagram comparison is opened.

## Next Architecture Step

Create staging before any larger hosting split:

1. Staging Postgres from a sanitized/copy backup.
2. Staging Railway service pointed at staging DB.
3. Optional Vercel preview pointed at staging backend.
4. Smoke tests for API, WebSocket, login/session, imports, and ontology screens.

Operational runbook: `docs/staging-runbook.md`.
