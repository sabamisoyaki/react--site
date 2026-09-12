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
