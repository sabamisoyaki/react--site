# Repository Guidelines

## Architecture

- This repo is a Next.js App Router application backed by Prisma/PostgreSQL.
- Treat `src/server` as the application backend boundary. Prefer existing schema -> service -> repository layering over route-local logic.
- Keep Auth.js / NextAuth routes at `src/app/api/auth/[...nextauth]/route.js`. Do not move auth callback/session/provider endpoints under `/api/v1`.
- Treat `/api/extension/*` as the forward path for extension features. `POST /api/receive` is compatibility-only.

## Working Rules

- Read existing route, schema, and service patterns before changing behavior.
- Keep changes scoped to the requested issue. Do not refactor unrelated areas unless required to finish safely.
- Never log secrets or copy values from `.env.local`.
- Do not perform destructive git or database operations unless the user explicitly asked for them.
- Git read-only commands such as `git status`, `git diff`, `git log`, and `git show` are allowed.
- Do not run history, branch, or PR lifecycle commands such as `git add`, `git commit`, `git push`, `git tag`, `gh pr create`, or `gh pr merge`.
- `gh pr view`, `gh pr diff`, `gh pr review`, and `gh pr comment` are allowed only when the user explicitly asks for PR inspection, review submission, or commenting.
- When commit, push, PR creation, or merge steps are needed, provide the exact commands for the user to run instead of executing them.

## Validation

- Standard local gate for code-only work:
  - `npm run codex:quick`
- Schema and migration gate for Prisma work:
  - `npm run codex:schema`
- DB connectivity gate for DB-backed work:
  - `npm run codex:db`
- Full pre-handoff gate for high-risk changes:
  - `npm run codex:full`

## Database Workflow

- Prisma changes must follow this order:
  1. Edit `prisma/schema.prisma`
  2. Create a skeleton migration with `npx prisma migrate dev --create-only --name <name>`
  3. Run `node --import tsx scripts/prisma-augment.ts`
  4. Review `prisma/migrations/<timestamp>_<name>/migration.sql`
  5. Apply with `npx prisma migrate dev`
- If Prisma tries to generate follow-up diff noise around partial indexes, stop and inspect before proceeding.
- シャドウDB は履歴を空の Postgres へ先頭から再生する。`20260430010000_init`
  より前に何かを挿すと再生が止まり、`migrate dev` が使えなくなる。
  `tests/db/migrations.test.mjs` が先頭と SQLite 方言の混入を見張っている。
- 適用済みの migration ファイルは編集しない。チェックサム不一致で適用済み環境の
  `migrate deploy` が止まる。相当の DDL は未適用の migration へ集約する。

## Delivery Format

- For implementation tasks, finish with the exact commands you ran and whether they passed.
- When handoff requires a commit, push, PR creation, or merge, include suggested commands and a suggested commit message, but do not execute them.
- For review tasks, lead with concrete findings, file references, and missing tests.
- If a task is blocked by DB connectivity, state whether `codex:quick` and `codex:schema` still pass.
