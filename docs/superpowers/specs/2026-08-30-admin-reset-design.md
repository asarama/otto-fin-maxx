# Design — Admin tab: full reset and owner management

**Date:** 2026-08-30
**Status:** Draft

---

## 1. Problem

The app auto-seeds defaults (`owners` Me/Wife/Family, one budget + General
category per owner) on **every** DB open (`getDb()` calls `seedDefaults`).
There is no way to wipe data from the UI, and owners can only be created by that
seeder — the Budgets page reads `data.owners` but has no owner-creation form.

Consequences:

- Starting fresh requires manually deleting `data/finance.db`.
- After any reset, the seeder immediately recreates the defaults, so a reset
  never sticks.
- Owners cannot be created or managed through the app at all.

## 2. Goal

Add an **Admin** tab that can:

1. **Reset all data** — truncate every table so the DB is completely empty.
2. **Manage owners** — create owners manually (the only remaining way they can
   exist, once the auto-seeder is removed).

And stop auto-seeding on startup: `getDb()` opens the schema but seeds nothing.
A full reset therefore stays empty until the user deliberately adds data.

Explicitly out of scope:

- **Editing/deleting owners.** Only creation. Deleting an owner would cascade to
  budgets/categories/snapshots and is not requested.
- **Dropping/recreating tables.** Tables and schema are untouched; rows are
  deleted in place.
- **Backups/export.** Resetting is destructive by design; users keep their own
  `data/finance.db` copies.

## 3. Behavior

### 3.1 Reset all data

Admin page shows a **Reset all data** action backed by `POST /api/admin/reset`.
It deletes every row from all 10 tables, in foreign-key-safe order (children
first), inside a single transaction:

```
1. account_transactions
2. rule_vendors
3. vendor_aliases
4. budget_category_months
5. rules
6. budget_categories
7. accounts
8. vendors
9. budgets
10. owners
```

After the reset the app re-runs `SCHEMA_SQL` (idempotent `CREATE TABLE IF NOT
EXISTS`) on next `getDb()`, but **no longer seeds anything**, so tables stay
empty. The API response returns post-reset row counts so the page can confirm.

Confirmation uses the existing two-step arm pattern (`ConfirmDelete`): click the
delete control, then click **Reset all data** to fire. The whole page revalidates
afterward (`invalidateAll()`), so counts and the unreviewed badge refresh.

### 3.2 Remove the auto-seeder

- `src/lib/server/db.ts`: drop the `seedDefaults` import and call. `getDb()`
  keeps applying `SCHEMA_SQL`.
- `src/lib/server/seed.ts` **stays** — it is still used by `createTestDb()`
  (tests need the seeded owners/budgets/categories) and `db.test.ts` tests the
  seeder itself.
- `scripts/sample-data.ts`: currently does `listOwners().find('Me')!`, which
  would crash on a fresh, empty DB. It gains an `ensureOwner` helper that creates
  owners when missing, so `npm run sample-data` still works from a clean slate.

### 3.3 Owner management (Admin tab)

- New `createOwner(conn, name)` in `src/lib/server/repos/budgets.ts` (alongside
  `listOwners`). Duplicate names are rejected with a 400.
- Admin page has an **Owners** section: a list of existing owners and an "Add
  owner" form.
- The Budgets page's owner dropdown reads the same `listOwners` data and picks
  up newly created owners automatically (no change needed there).

## 4. Implementation surface

| File | Change |
|---|---|
| `src/lib/server/repos/admin.ts` | new `truncateAll(conn): Promise<TableCounts>` — deletes all rows in dependency order in one transaction; returns per-table post-reset counts |
| `src/lib/server/repos/admin.test.ts` | tests for `truncateAll`: seeds data, truncates, asserts every table empty; counts all zero |
| `src/lib/server/repos/budgets.ts` | add `createOwner(conn, name): Promise<Owner>` |
| `src/lib/server/repos/budgets.test.ts` | tests for `createOwner` (creates; duplicate name rejected) |
| `src/lib/server/db.ts` | remove `seedDefaults` import/call |
| `src/lib/server/page-data.ts` | add `adminData(conn)` — per-table row counts + owners list |
| `src/routes/admin/+page.server.ts` | new; loads `adminData(conn)` |
| `src/routes/admin/+page.svelte` | new page: table of row counts, Reset all data action, Owners section |
| `src/routes/api/admin/reset/+server.ts` | new; `POST` → `truncateAll`, returns counts |
| `src/lib/components/NavRail.svelte` | add Admin link |
| `src/lib/components/Icon.svelte` | add an `admin` (gear/settings) icon |
| `scripts/sample-data.ts` | `ensureOwner` so it works on an empty DB |
| `README.md` / `AGENTS.md` | update wording that says first run seeds defaults |

No schema changes. No owner edit/delete UI.

## 5. Testing

- **Repo test** `truncateAll`: on the in-memory test DB, seed data across all
  tables, truncate, assert every table has zero rows and the returned counts are
  all zero. Verifies the delete order doesn't trip FK errors.
- **Repo test** `createOwner`: creates and returns the owner; a second create
  with the same name rejects with a duplicate error.
- Existing tests are unaffected: `createTestDb()` still seeds, so seeded-owner
  assumptions in repo/import tests keep passing.
- Full gate before claiming done:
  `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.

## 6. Error handling

- `truncateAll` deletes rows in FK-safe children-first order. It does **not**
  wrap the deletes in a single transaction: DuckDB v1.5.5 has an upstream bug
  (duckdb#13819) where a parent-table FK check inside a transaction does not see
  uncommitted child deletions, so a transactional truncate fails spuriously.
  Trade-off: if a delete fails mid-sequence, earlier tables remain truncated (no
  all-or-nothing atomicity).
- `createOwner` validates the name (non-empty, unique) and returns 400 on
  duplicates or blanks.
- Reset is intentionally unauthenticated (local single-user app), matching the
  rest of the API.