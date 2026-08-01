# AGENTS.md

Guidance for AI agents working on this codebase.

## Project overview

Local single-user finance app: SvelteKit (Svelte 5 runes) + DuckDB via `@duckdb/node-api`, `csv-parse`, Vitest, TypeScript. Imports Capital One / BMO CSVs, categorizes debits into budget categories via rules, and reports monthly spend vs. limits.

See `docs/superpowers/plans/2026-08-01-finance-app.md` for the full implementation plan and `docs/superpowers/specs/` for the design spec.

## Toolchain

Node.js is managed via mise (see `mise.toml`, pinned Node 22.13.0). `node`/`npm` are on the mise shims path:

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
```

## Commands

| Command                                    | What it does                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `npm install`                              | Install dependencies                                                      |
| `npm run dev`                              | Start dev server (Vite)                                                   |
| `npm run check`                            | `svelte-kit sync` + `svelte-check` (type-check Svelte/TS). **Must pass.** |
| `npm run lint`                             | ESLint (flat config `eslint.config.js`). **Must pass.**                   |
| `npm run format`                           | Prettier write (formats the repo)                                         |
| `npm run format:check`                     | Prettier check — **must pass before committing**                          |
| `npm run build`                            | Production build (`vite build` via adapter-node). **Must pass.**          |
| `npm test` / `npx vitest run`              | Run unit tests. **Must pass.**                                            |
| `npm run sample-data`                      | Seed sample data into the DB (idempotent)                                 |
| `npm run import -- <accountId> <file.csv>` | Import a bank CSV via CLI                                                 |

**Required verification before claiming work complete or committing:** `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.

### Running tests

- Tests live next to source as `*.test.ts` (Vitest).
- Unit tests for server code run under the `node` environment and use `createTestDb()` from `src/lib/server/test-helpers.ts` for an in-memory DuckDB instance (schema + seeds applied). Server test setup lives in `vite.config.ts` (`test.projects[].environment = 'node'`).
- Run a subset: `npx vitest run src/lib/parsers` or `npx vitest run src/lib/server/repos/accounts.test.ts`.

## Linting and formatting

- **ESLint** (`eslint.config.js`, flat config): `@eslint/js`, `typescript-eslint`, `eslint-plugin-svelte` (flat/recommended), `eslint-config-prettier`. Generated output (`build/`, `.svelte-kit/`, `node_modules/`, `data/`) is ignored.
- **Prettier** (`.prettierrc`): tabs, single quotes, trailing commas (es5), 100 col, `prettier-plugin-svelte`. `.prettierignore` excludes generated output.
- Svelte rules that commonly fire and are **expected to be fixed, not disabled**:
  - `svelte/require-each-key` — every `{#each}` needs a key (`(item.id)`).
  - `svelte/no-navigation-without-resolve` — use `resolve()` from `$app/paths` for `<a href>` links (pass literal route strings; use `as const` on link arrays so `resolve()` type-checks).
  - `svelte/prefer-svelte-reactivity` — use `SvelteSet` from `svelte/reactivity`, not `new Set()` (and do not wrap it in `$state`).
  - `@typescript-eslint/no-unused-vars` — remove dead state variables.

## End-to-end verification (manual)

There is no automated e2e suite. The e2e flow is manual, against a throwaway DB, via the dev server and `curl`. Use a fresh DB per run: `rm -f /tmp/opencode/finance-e2e.db`.

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
rm -f /tmp/opencode/finance-e2e.db
FINANCE_DB_PATH=/tmp/opencode/finance-e2e.db npm run sample-data
setsid env FINANCE_DB_PATH=/tmp/opencode/finance-e2e.db npm run dev > /tmp/opencode/dev.log 2>&1 < /dev/null &
sleep 6
```

Then check every page returns 200 with its title:

```bash
for pair in "/ Dashboard" "/accounts Accounts" "/budgets Budgets" "/rules Rules" "/vendors Vendors" "/review Review" "/transactions Transactions"; do
  path="${pair% *}"; label="${pair#* }"
  curl -s "http://localhost:5173$path" | grep -q "$label" && echo "$path OK" || echo "$path FAIL"
done
```

Exercise the API: create/rename an account, list accounts, import a fixture CSV, create a rule, test rule matching, and batch-assign review rows. Fixtures live in `src/lib/parsers/fixtures/`.

Example import through the API (get the account id from `GET /api/accounts`):

```bash
curl -s -X POST http://localhost:5173/api/accounts/<id>/import -F file=@src/lib/parsers/fixtures/capitalOne-sample.csv
```

Expected: `{"imported":3,"duplicates":0,"errors":[],"categorized":N,"parseErrors":[]}`.

Multi-month review check: unreviewed transactions across different months batch-assigned to one category must each land in their own month's `budget_category_months` snapshot (verify `month` equals `substr(posted_date,1,7)`).

Stop the dev server when done: `pkill -f "vite dev"`.

## Important gotchas

- **DuckDB is single-writer.** Only one process may hold a DB file open at a time. You cannot run `tsx` scripts against a DB that a running dev server already has open (file lock error). Stop the dev server before running scripts against the same `FINANCE_DB_PATH`.
- **`at` is a reserved word in DuckDB** (`AT TIME ZONE`). Never alias a table `at`; use e.g. `tx`. SQL is only validated at runtime, not by `check`/`build` — always exercise queries against a live DB.
- DB path: `process.env.FINANCE_DB_PATH ?? 'data/finance.db'` (see `src/lib/server/db.ts`). `data/` and `*.db` are gitignored.
- Node CLI/`tsx` top-level `await` fails outside the project's module scope — wrap scripts in an async IIFE if needed.

## Code conventions

- **Money is always integer cents** (`number`). Never use floats for money. `parseAmountToCents` / `centsToDollars` in `src/lib/money.ts`.
- Dates are `TEXT 'YYYY-MM-DD'`; months are `TEXT 'YYYY-MM'` (`src/lib/date.ts`).
- All DB access lives under `src/lib/server/` or `src/routes/**/+server.ts` / `+page.server.ts`. Nothing else imports `@duckdb/node-api`. Repos wrap CRUD; pure logic (money, dates, CSV parsing, rule/vendor matching) lives in `$lib` and is unit-tested.
- `assignment_status`: `'auto' | 'manual' | 'unreviewed'`. Rule re-runs only touch `'unreviewed'`; never overwrite `'auto'`/`'manual'`.
- `amount_operator`: `'any' | 'eq' | 'lt' | 'lte' | 'gt' | 'gte'`.
- `accounts.bank`: `'capital_one' | 'bmo'`; `accounts.type`: `'credit' | 'debit'`.
- Rule matching: first match wins by `priority` ascending; a match requires every set criterion to pass.
- IDs are UUIDs generated in app code with `randomUUID()`.
- **No explanatory comments** in code.
- Svelte 5 runes throughout (`$props()`, `$state()`, `$derived()`, `$effect()`).
