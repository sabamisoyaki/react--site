# FigFingers React Site

Next.js App Router application for FigFingers. The current branch uses a Prisma/PostgreSQL backend with:

- NextAuth v5
- Prisma 7
- `src/server` service/repository layering
- `prisma-augment` for partial indexes, partial unique indexes, and raw SQL
- extension connection APIs under `/api/extension/*`

## Setup

1. Install dependencies.
   `npm install`
2. Prepare env files.
   Copy `Example.env.local` into `.env.local` and fill in:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
   - `NEXTAUTH_URL`
   - `CLIP_API_ALLOWED_ORIGINS`
3. Start the app.
   `npm run dev`

## Codex Workflow

Use the Codex harness scripts to keep AI-driven changes inside a repeatable validation flow:

- `npm run codex:quick`
  - checks Node 24.x, regenerates Prisma Client and Next.js route types, then runs lint, all tests, and TypeScript
- `npm run codex:schema`
  - validates Prisma schema and fails if `prisma-augment` finds SQL that still needs generating; does not replay migrations
- `npm run codex:db`
  - verifies `.env.local`, starts the SSH tunnel when `DB_SSH_USER` and `DB_SSH_PORT` are set, and runs `prisma migrate status`
- `npm run codex:full`
  - runs all of the above plus `npm run build`

In Windows PowerShell, use `npm.cmd run codex:quick` if `npm.ps1` is blocked. The harness also runs directly with `node scripts/codex-harness.mjs quick`; it launches installed JavaScript CLIs without npm/npx command shims. Prisma commands need a configured `DATABASE_URL`, but quick/schema validation does not connect to the database.

Repository-specific Codex guidance, Git permissions, and required validation gates live in [AGENTS.md](AGENTS.md). Local commits are allowed; outward-facing Git/PR actions follow its separate permission rules. The `docs/` directory is an untracked local workspace.

## Database

This repo expects PostgreSQL. The migration history starts with:

- [prisma/migrations/20260430010000_init/migration.sql](prisma/migrations/20260430010000_init/migration.sql)

For a fresh, dedicated development database, load its `DATABASE_URL`, then apply the existing migrations and generate the client:

```bash
npx prisma migrate deploy
npx prisma generate
```

## Prisma Augment Workflow

This project does not rely on plain `prisma migrate dev` alone. Partial indexes and partial unique indexes are generated from comments in [prisma/schema.prisma](prisma/schema.prisma) by [scripts/prisma-augment.ts](scripts/prisma-augment.ts).

Follow the [Database Workflow in AGENTS.md](AGENTS.md#database-workflow). Author migrations using a dedicated development database and disposable shadow database. Before augment writes to the latest migration, verify that file belongs to the current change and is unapplied. After reviewing and applying it locally, explicitly run `npx prisma generate`.

Shared, staging, and production databases receive reviewed, committed migrations via `prisma migrate deploy` as part of an authorized deployment. They must not be used for `migrate dev`, including `--create-only`.

If Prisma prompts you to create an extra migration after your intended migration has already been applied, stop and inspect the generated SQL before continuing. In this repo that usually means Prisma is trying to convert augment-managed partial indexes into normal diff output.

## Extension APIs

The extension connection flow is implemented on top of the DB/API redesign.

- `GET /api/extension/session`
- `POST /api/extension/link-token`
- `POST /api/extension/link`
- `POST /api/extension/sync`

The backing tables are:

- `linked_extensions`
- `extension_link_tokens`
- `sync_receipts`

`linked_extensions` uses augment-managed active-only indexes:

- partial unique on `extension_instance_id` where `revoked_at IS NULL`
- partial index on `(user_id, last_seen_at)` where `revoked_at IS NULL`

## Auth API Policy

`/api/auth/*` is owned by Auth.js / NextAuth and is intentionally not modeled as a v1 application API path.

- Keep the implementation at `src/app/api/auth/[...nextauth]/route.js`
- Do not move Auth.js callback/session/provider routes under `/api/v1`
- Represent auth in `openapi/v1.yaml` with `securitySchemes` and per-operation `security`
- Document only application-owned auth-adjacent APIs such as `/me`

## Legacy Ingest

`POST /api/receive` is still present as a legacy ingest path for old clients.

- It now requires an authenticated session
- It now checks allowed origins
- It converts legacy clip payloads into the current `clips` schema
- It is frozen as a compatibility path and should not receive new extension features

The intended long-term write path for extensions is `/api/extension/*`, not `/api/receive`.
Once the browser extension has been migrated to the new handshake, `/api/receive` should be removed.
