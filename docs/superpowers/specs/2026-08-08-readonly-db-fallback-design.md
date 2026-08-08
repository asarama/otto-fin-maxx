# Read-Only DB Fallback — Design Spec

**Date:** 2026-08-08
**Status:** Approved by user during brainstorming

## Problem

DuckDB allows only a single writer at a time. When another client (e.g. the `duckdb` CLI, a SQL editor, a scratch script) opens `data/finance.db` read-write first, the app's `getDb()` fails with `Could not set lock on file` on its own read-write open. Today that error bubbles up and every page/API breaks, with no explanation.

## Goal

When the database is locked by another process:

1. The app attaches in **read-only mode** so read-only pages (Dashboard, Budgets, Vendors, Transactions, Rules) still work.
2. The frontend shows a **global warning banner** explaining the state.
3. **Write controls are disabled** so users can't attempt actions that would fail.

## Non-Goals

- No auto-retry / upgrade back to read-write while the server runs. Mode is fixed for the process lifetime (per brainstorming decision). A restart once the other client closes is the recovery path.
- No changes to the underlying lock semantics of DuckDB.
- No e2e automation for this path (covered manually).

## Approach

Module-level mode flag + fallback open, surfaced through the root layout.

## Design

### 1. Server — read-only fallback (`src/lib/server/db.ts`)

Add a module-level flag:

```ts
let dbAccessMode: 'read-write' | 'read-only' = 'read-write';

export function getDbAccessMode(): 'read-write' | 'read-only' {
	return dbAccessMode;
}
```

In `getDb()`:

1. Try `DuckDBInstance.create(path)` (read-write) as today.
   - On success: run `SCHEMA_SQL` + `seedDefaults`, leave `dbAccessMode = 'read-write'`.
2. If that throws: retry `DuckDBInstance.create(path, { access_mode: 'READ_ONLY' })`.
   - On success: set `dbAccessMode = 'read-only'`, **skip** `SCHEMA_SQL` and `seedDefaults` (both execute `CREATE`/`INSERT` and would throw on a read-only connection). Existing schema/tables are already present since the DB file exists.
   - If read-only open also fails: rethrow the **original** read-write error so genuine failures (missing/corrupt file, etc.) aren't masked.

The global connection cache (`g.__financeDbConnection`) and single-connection-per-process behavior stay unchanged.

### 2. Server — surface mode to the frontend (`src/routes/+layout.server.ts`)

Return `dbAccessMode` alongside the existing `unreviewedCount`:

```ts
return { unreviewedCount: await countUnreviewed(conn), dbAccessMode: getDbAccessMode() };
```

In SvelteKit, root layout data is merged into every page's `data` prop automatically, so all pages and `AppShell` read it without per-page load changes.

### 3. Frontend — global banner (`src/lib/components/AppShell.svelte`)

`AppShell` already renders above all page content. When `dbAccessMode === 'read-only'`, render an existing `InlineBanner` (warning tone) at the top of the content column:

> Database is in read-only mode — another client has it open. Changes are disabled until it's closed.

Thread `dbAccessMode` from `+layout.svelte`'s `data` into `AppShell` (mirroring the existing `unreviewedCount` prop pattern).

### 4. Frontend — disable write UI

Each page with write actions derives `const readOnly = data.dbAccessMode === 'read-only'` and gates its write controls:

- Accounts (`src/routes/accounts/+page.svelte`): Add account form, rename button/form, CSV import file input.
- Budgets (`src/routes/budgets/+page.svelte`): Add budget form, add category form, limit input.
- Vendors (`src/routes/vendors/+page.svelte`): Add vendor form, merge form, add-alias button/input.
- Rules (`src/routes/rules/+page.svelte`): Add rule form, edit form, enable/disable, delete, move (↑/↓). **Test rule is read-only and stays enabled.**
- Review (`src/routes/review/+page.svelte`): batch-assign form, create-rule controls.
- Transactions (`src/routes/transactions/+page.svelte`): category-assign select. **Filters stay enabled** (they only rewrite the URL).

Concrete mechanism, per page:
- Disable write buttons with `disabled={readOnly}`.
- Disable write inputs/selects with `disabled={readOnly}` (or hide write forms via `{#if !readOnly}` where that reads better, e.g. Add forms).

Read-only navigational controls (filters, month picker, rule test) remain enabled.

### 5. Tests

Unit tests in `src/lib/server/db.test.ts` (or a sibling):

- **RW happy path (existing behavior):** `getDb()` with no lock connects read-write, mode is `'read-write'`, schema + seeds applied (existing test coverage preserved).
- **Read-only fallback:** create a temp DB file, open a second read-write `DuckDBInstance`/connection against it first (simulating the other client), point `FINANCE_DB_PATH` at it, call `getDb()`, assert:
  - mode is `'read-only'`,
  - reads work (`SELECT` against a seeded table),
  - writes throw (INSERT rejected),
  - schema/seed are skipped without error.
- **Both opens fail:** point `FINANCE_DB_PATH` at a path that can't be opened (e.g. a path inside a nonexistent directory), assert the original error propagates and mode stays `'read-write'`.

The module-level `dbAccessMode`/cache is reset between tests (existing test setup pattern).

### 6. Verification

- `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.
- Manual: hold `data/finance.db` open via `duckdb data/finance.db` in a terminal, start the dev server (against a throwaway copy to avoid corrupting real data), confirm:
  - Banner renders on every page.
  - Write buttons/inputs are disabled; filters, month picker, rule test still work.
  - Reading pages (Dashboard, Budgets) show data.
  - Stopping the CLI and restarting the dev server returns to normal read-write mode.
