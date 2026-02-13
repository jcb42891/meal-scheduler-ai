# AGENTS.md - meal-scheduler-ai

Project snapshot
- App type: Next.js (App Router) + TypeScript + Tailwind; Supabase for auth/data.
- Main entry: `app/layout.tsx` (AuthProvider + Navbar + global layout).
- Auth gate: `middleware.ts` redirects unauthenticated users to `/auth`.

How the app is organized
- Routes live in `app/` (App Router). Each folder with `page.tsx` is a route.
- Shared UI primitives in `components/ui/` (button, card, dialog, etc.).
- Feature helpers live next to their pages (e.g., `app/meals/*`, `app/calendar/*`).
- Data/auth utilities in `lib/` (`lib/supabase.ts`, `lib/contexts/AuthContext.tsx`, `lib/utils.ts`).
- Supabase edge functions + config in `supabase/`.
- Global styles in `app/globals.css`; static assets in `public/` and some page-local assets in `app/`.

Key routes and where to look
- Marketing/landing: `app/page.tsx` (hero landing, link to auth).
- Auth: `app/auth/page.tsx` (sign in/up, forgot password dialog).
- Password reset: `app/auth/update-password/page.tsx` and `app/update-password/page.tsx`.
- Calendar + grocery list: `app/calendar/page.tsx` with modals in `app/calendar/*`.
- Meal library CRUD: `app/meals/page.tsx` with dialogs and helpers in `app/meals/*`.
- Groups: `app/groups/page.tsx` and `app/groups/[id]/page.tsx` (group management).
- Accept invite: `app/groups/accept-invite/page.tsx`.
- Profile: `app/profile/page.tsx`.
- Global navigation: `app/components/navbar.tsx`.

Supabase touchpoints
- Client: `lib/supabase.ts` (`createClientComponentClient`).
- Auth context: `lib/contexts/AuthContext.tsx` (session/user state).
- Edge function: `supabase/functions/send-group-invite/index.ts`.
- Middleware redirects based on session: `middleware.ts`.

DB migrations (Drizzle + remote Supabase)
- Migrations live in `drizzle/*.sql` and are tracked by `drizzle/meta/_journal.json`.
- Required execution rule: whenever you add a new migration, run it against **staging** immediately (do not leave it unapplied locally-only).
  - Preferred source of truth: `STAGING_DATABASE_URL` env var.
  - Fallback (only if it points to staging): `DATABASE_URL` in `.env.local`.
- Add a new migration:
  1) Create a new SQL file in `drizzle/` (next sequential tag, e.g. `0002_*.sql`).
  2) Add a matching entry in `drizzle/meta/_journal.json` with `idx` incremented and a `when` value greater than the previous entry.
  3) Run `npm run db:migrate` with `DATABASE_URL` set to the staging Supabase Postgres connection string.
  4) Run `npm run db:introspect` against that same staging DB to verify migration state matches expectations.
- Important: `0000_*` is an introspection baseline and must NOT be executed against the remote DB.
  - If migrations fail trying to run `0000_*`, mark it as applied in the remote DB by inserting into `drizzle.__drizzle_migrations`,
    then rerun `npm run db:migrate`.
- Verification: after introspection, confirm schema changes with a query like:
  - `select column_name from information_schema.columns where table_schema='public' and table_name='meals';`
- GitHub Actions migration workflow:
  - Workflow: `.github/workflows/db-migrate.yml` (manual trigger only).
  - Why: keep schema changes automated but decoupled from Vercel deploys to avoid build-time failures/races.
  - How to use:
    1) Run the workflow via GitHub Actions → `db-migrate`.
    2) Pick `staging` or `production` and type `CONFIRM`.
  - It uses `npm run db:migrate` and expects secrets:
    - `STAGING_DATABASE_URL`
    - `PROD_DATABASE_URL`

UI + styling
- Tailwind config: `tailwind.config.ts`.
- Shared UI components: `components/ui/*`.
- Toasts: `sonner` (used in most pages).

Suggested navigation flow (for future work)
- Start with the route in `app/` you’re touching.
- Check for local components or helpers in the same folder.
- If auth/state issues: inspect `lib/contexts/AuthContext.tsx`, `lib/supabase.ts`, `middleware.ts`.
- If UI primitives or shared styles: check `components/ui/*` and `app/globals.css`.
- If group/meal/calendar data is involved: search for Supabase table names in the feature folder.

Agent coordination and git safety rules
- Delete unused or obsolete files when your changes make them irrelevant (refactors, feature removals, etc.), and revert files only when the change is yours or explicitly requested. If a git operation leaves you unsure about other agents' in-flight work, stop and coordinate instead of deleting.
- Before attempting to delete a file to resolve a local type/lint failure, stop and ask the user. Other agents are often editing adjacent files; deleting their work to silence an error is never acceptable without explicit approval.
- NEVER edit `.env` or any environment variable files; only the user may change them.
- Coordinate with other agents before removing their in-progress edits; don't revert or delete work you didn't author unless everyone agrees.
- Moving/renaming and restoring files is allowed.
- ABSOLUTELY NEVER run destructive git operations (e.g., `git reset --hard`, `rm`, `git checkout`/`git restore` to an older commit) unless the user gives an explicit, written instruction in this conversation. Treat these commands as catastrophic; if you are even slightly unsure, stop and ask before touching them. (When working within Cursor or Codex Web, these git limitations do not apply; use the tooling's capabilities as needed.)
- Never use `git restore` (or similar commands) to revert files you didn't author; coordinate with other agents instead so their in-progress work stays intact.
- Always double-check `git status` before any commit.
- Keep commits atomic: commit only the files you touched and list each path explicitly. For tracked files run `git commit -m "<scoped message>" -- path/to/file1 path/to/file2`. For brand-new files, use the one-liner `git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2`.
- Quote any git paths containing brackets or parentheses (e.g., `src/app/[candidate]/**`) when staging or committing so the shell does not treat them as globs or subshells.
- When running `git rebase`, avoid opening editors; export `GIT_EDITOR=:` and `GIT_SEQUENCE_EDITOR=:` (or pass `--no-edit`) so the default messages are used automatically.
- Never amend commits unless you have explicit written approval in the task thread.

Testing and completion rules
- Always add or update automated tests for any task that changes behavior, logic, UI, or data flow before considering the task complete.
- Before marking a task done, run the full test suite and confirm all tests pass.
- If any test fails, the task is not complete until failures are fixed or the user explicitly approves an exception.
