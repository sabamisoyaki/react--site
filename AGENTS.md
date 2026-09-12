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
- Do not perform destructive database operations unless the user explicitly asked for them.

## Git

Permission follows what a command does to the repository, not what it is called. An unlisted
command is judged by which group its effect puts it in.

- **Read-only — always allowed, no need to ask.** Anything that leaves the working tree, index,
  refs, and remotes untouched: `status`, `diff`, `log`, `show`, `ls-files`, `ls-tree`,
  `check-ignore`, `branch --show-current`, `branch --contains`, `rev-list`, `reflog`,
  `stash list`, `gh pr view`, `gh pr diff`.
- **Local writes — allowed, no permission needed.** `git add`, `git commit`, `git switch -c` /
  `git checkout -b`, `git tag`. These stay on the machine and are recoverable, so commit and branch
  whenever it helps the work rather than stopping to ask. Keep each commit scoped to one change and
  write a message that says why, not just what.
- **Outward-facing — confirm every single time.** `git push`, `gh pr create`, `gh pr merge`,
  `gh pr review`, `gh pr comment`. Other people see the result and a local reset does not take it
  back. Ask immediately before each one and wait for the answer. Approval never carries over:
  having pushed this branch earlier, or having been told "go ahead" on the previous step, is not
  authorization for the next one. Say what will become visible to whom before asking.
- **Destructive — explicit permission, and only once a way back exists.** `git reset --hard`,
  `git push --force`, `git rebase`, `git clean`, `git rm`, branch or tag deletion, and anything
  that rewrites history. Do not reach for one as a shortcut past a problem; there is almost always
  a non-destructive route, and that route is the default. When one is genuinely required, work
  through this order and do not compress it:

  1. **Permission.** The user has to have named that operation, or approved it after you described
     it. A general "clean this up" or "fix the branch" is not authorization.
  2. **Inventory.** Read what is about to be lost and report it back in concrete terms — the
     commits (`git log --oneline`), the uncommitted changes (`git status`), the files. Never
     describe the blast radius from assumption; look first.
  3. **Recovery point.** Leave a way back before touching anything: tag or branch the current HEAD
     (`git branch backup/<what> HEAD`), or stash. Write down the SHA.
  4. **Run it, then report.** State what was destroyed and name the recovery point, so the user can
     undo it without asking how.

  If any step cannot be completed — the permission is ambiguous, the inventory cannot be read, no
  recovery point is possible — stop and say so instead of proceeding.

Two things to check when committing:

- Confirm the branch with `git branch --show-current` before `git add`. The checkout can change
  outside the session (GitHub Desktop, another terminal), so the branch reported at the start of
  the session is not reliable.
- Committing triggers husky + lint-staged, which rewrites staged `.ts` / `.tsx` / `.js` / `.jsx` /
  `.json` / `.css` / `.scss` files with `biome format --write`, so the committed tree can differ from
  what the validation gate saw. Markdown is in the lint-staged glob but Biome 2.3.14 does not process
  it, and `biome.json` sets `vcs.useIgnoreFile`, so `.md` and everything under `/docs` pass through
  untouched.

## docs/

`/docs` is **never tracked**. It is a local workspace for AI-written research, audits, and plans,
and the exclusion covers everything under it — the subfolder indexes and `docs/README.md` itself
included. There are no per-file exceptions.

- Do not `git add -f` anything under `docs/` to get around the exclusion.
- Write freely there. Those files are for the machine they were written on, not for the repository.
- A document that genuinely has to reach everyone who clones the repo does not belong in `docs/`.
  Put the durable rule in this file, or next to the code it describes.

The consequence is deliberate and worth stating plainly: someone who clones this repository gets
none of it, and neither does a fresh agent session on another machine.

## Validation

- Use Node.js 24.x and installed dependencies. On Windows PowerShell, use `npm.cmd`
  instead of `npm` if the execution policy blocks `npm.ps1`; no policy change is needed.
  `node scripts/codex-harness.mjs <quick|schema|db|full>` also works directly.
- For code changes, run `npm run codex:quick`: regenerate Prisma Client, generate Next.js
  route types, lint, run all `tests/**/*.test.mjs`, and typecheck. Prisma generation needs
  `DATABASE_URL` in `.env.local`, `.env`, or the process environment, but does not connect to DB.
- For Prisma schema, migrations, or augment changes, also run `npm run codex:schema`:
  Prisma validation and an augment check that fails if generated SQL is missing.
  This does not replay SQL, check applied-file checksums, or verify the live DB schema.
  Review raw-SQL removal warnings and any hand-written inverse SQL separately.
- For DB-backed behavior changes, also run `npm run codex:db`: configuration, optional
  SSH tunnel, and migration status. This is a connectivity/history check, not a behavior test.
- For auth, authorization, extension-token lifecycle, migration SQL/generation, or destructive
  data behavior changes, run `npm run codex:full` (quick + schema + db + production build).
  A successful full run covers the individual gates; do not repeat them without a reason.
- For documentation-only changes, check the changed instructions, links, and commands;
  application gates are not required unless executable behavior also changed.
- If DB access is unavailable, complete independent checks and run `npm run build` separately
  when full validation is required. Report passed, failed, and unrun checks distinctly.

## Database Workflow

- Separate migration authoring from deployment. `migrate dev` (including `--create-only`)
  is only for a dedicated development database with a disposable shadow database. Never point
  it at a shared, staging, production, or otherwise non-disposable database.
- Before DB commands, identify the target environment without printing credentials.
  CLI commands below assume the intended `DATABASE_URL` is loaded. For an env file, use
  `node --env-file=<selected-env-file> node_modules/prisma/build/index.js <arguments>`;
  for augment use `node --env-file=<selected-env-file> --import tsx scripts/prisma-augment.ts`.
  The filename `.env.local` does not prove the database is disposable.
- On the dedicated development database, follow this order:
  1. Edit `prisma/schema.prisma`
  2. Create a skeleton migration with `npx prisma migrate dev --create-only --name <name>`
  3. Verify a new migration directory was created for this change and is the latest directory.
     Confirm its migration is unapplied before writing: augment selects the latest file and
     does not query the database to protect applied migrations.
  4. Run `node --import tsx scripts/prisma-augment.ts`
  5. Review `prisma/migrations/<timestamp>_<name>/migration.sql`, then run `npm run codex:schema`
  6. Apply to the dedicated development database with `npx prisma migrate dev`
  7. Regenerate Prisma Client with `npx prisma generate` (Prisma 7 does not do this automatically),
     then run the required validation gates.
- If a dedicated development/shadow database is unavailable, prepare a new, unapplied SQL
  migration and complete static checks. Report that migration replay/application is unverified;
  do not substitute the shared database for development or run a reset to unblock the work.
- Deployment to shared/staging/production databases uses reviewed, committed migrations with
  `npx prisma migrate deploy` only when that deployment is in the user's authorized scope.
  Run `npx prisma generate` for the application build and check migration status after deployment.
- If Prisma tries to generate follow-up diff noise around partial indexes, stop and inspect before proceeding.
- シャドウDB は履歴を空の Postgres へ先頭から再生する。`20260430010000_init`
  より前に何かを挿すと再生が止まり、`migrate dev` が使えなくなる。
  `tests/db/migrations.test.mjs` が先頭と SQLite 方言の混入を見張っている。
- 適用済みの migration ファイルは編集しない。Prisma 7.4.0 ではチェックサム不一致を
  検出して reset を要求するのは `migrate dev` であり、`migrate status` /
  `migrate deploy` はチェックサムだけの不一致を報告しない。相当の DDL は未適用の
  migration へ集約する。

## Delivery Format

- For implementation tasks, finish with the exact commands you ran and whether they passed.
- After committing, report the branch and the short SHA. When a push, PR creation, or merge is the
  next step, state the exact command rather than running it.
- For review tasks, lead with concrete findings, file references, and missing tests.
- If a task is blocked by DB connectivity, state whether `codex:quick` and `codex:schema` still pass.
