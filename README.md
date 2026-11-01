# Magnus Boy's System

Construction management for contractors in Jamaica and the Caribbean: projects, BOQ and estimates, purchasing,
workers and payroll (Jamaican statutory rates), client and field-officer portals, receipts and books. Multi-company:
each company only ever sees its own data.

- Live: https://app.magnusboys.com (branch `main`). Staging: branch `develop`.
- Stack: React 19 + TypeScript + Vite 7 + Tailwind, Supabase (database, auth, storage, edge functions), Vercel (hosting + `api/` server functions).
- Checks before every commit: `npx tsc -p tsconfig.app.json --noEmit`, lint on the files you changed, `npm run build`.

## Magnus HQ (platform control room)

Magnus HQ at `/hq` is the owner's control room for the whole platform: companies (as counts and totals), money and
billing, the services Magnus pays for, health, errors, traffic, support access, leads, feedback, the public website,
settings and the "Ask HQ" assistant. Only platform admins (table `platform_admins`, not a company role) can open it,
and only after 2-step login.

- How to use it: [docs/HQ_MANUAL.md](docs/HQ_MANUAL.md) (also the Manual tab inside HQ).
- For company owners: [docs/COMPANY_OWNER_GUIDE.md](docs/COMPANY_OWNER_GUIDE.md) (also Help → Your Magnus account).
- How it was built, step by step: [docs/HQ_PLAN.md](docs/HQ_PLAN.md).
- The rules every change must follow: [CLAUDE.md](CLAUDE.md).

The public website (home, pricing, status, privacy, terms, feedback) is a small separate bundle in `src/public`, shown to
signed-out visitors on `/` and to everyone on `/home`, `/pricing`, `/status`, `/privacy`, `/terms` and `/feedback`.

## Notable dependencies

- **`xlsx` (SheetJS)** is installed from SheetJS's own CDN tarball (`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`), not the plain npm registry — the registry's latest publish has two unpatched vulnerabilities that SheetJS fixed but never re-published to npm under this name. See the comment above the `import * as XLSX` in `src/lib/import/parseFile.ts` for the full explanation. Don't revert `package.json`'s `xlsx` entry to a normal `"^x.y.z"` version without reading that first.

## Deploying database changes

The live database has been changed by hand in the past, so the migration history on live and the files in `supabase/migrations` can disagree. Some old migrations would now undo security fixes if they were replayed (see `supabase/migration-history-audit.md`).

- **Never run `supabase db push` until `npx supabase migration list --linked` shows nothing pending.** `db push` applies every pending file, not just the one you meant.
- Applying a single migration safely:
  1. Read the file. Check it against the live objects it touches (`npx supabase db query --linked "select ..."`, read-only).
  2. Run just that file: `npx supabase db query --linked -f supabase/migrations/<version>_<name>.sql` (or paste it in the SQL editor). Keep it in one transaction (`BEGIN; ... COMMIT;`) so a failure leaves nothing half applied.
  3. Record it: `npx supabase migration repair --status applied <version> --linked`.
  4. Check `npx supabase migration list --linked`: local and remote columns should match for that version.
- If you change the live database by hand, put the same SQL in a migration file in the same change and record it with step 3, so the two never drift again.
- Never edit a migration that has already been applied; add a new one.
