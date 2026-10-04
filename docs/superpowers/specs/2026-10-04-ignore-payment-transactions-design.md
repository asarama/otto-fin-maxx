# Design — Ignore payment transactions

**Date:** 2026-10-04
**Status:** Draft

---

## 1. Problem

Payments (credit-card payoffs, transfers) land in the review queue and look like
ordinary uncategorized debits/credits. They are not spend and must not be
budgeted:

- The review queue is exactly `account_transactions.assignment_status =
  'unreviewed'` (`src/lib/server/repos/transactions.ts:68`), and nothing
  special-cases payments. A Capital One "PAYMENT THANK YOU" row is just a
  positive-amount transaction (`src/lib/parsers/fixtures/capitalOne-sample.csv:4`).
- Spend is `SUM(-amount_cents)` over transactions linked to a
  `budget_category_months` row (`src/lib/server/page-data.ts:39`). Assigning a
  payment to a category makes it **negative spend**, cancelling real purchases in
  that category.
- There is no "ignore"/"exclude"/transfer concept anywhere in the app.

## 2. Goal

Let the user mark a transaction as **ignored** so it is:

1. removed from the review queue and the unreviewed badge/count,
2. never counted toward any budget or spend total,
3. reversible — an ignored transaction can be restored to the review queue.

Ignoring is **manual and per-transaction** (plus a bulk action in the review
queue). Explicitly out of scope:

- **Automatic payment detection.** No heuristics on description/amount/account
  type, and no "ignore" action added to the rules engine.
- **Linking the two sides of a transfer.** A card payment still appears
  independently on the card account (positive) and the funding account
  (negative); the user ignores each side they care about.
- **Deleting transactions.** Ignoring is a status, not a delete.
- **Backfilling/migration of existing rows.** Existing unreviewed payments simply
  wait in the queue until the user ignores them.

## 3. Data model

Add a dedicated column rather than overloading `assignment_status`:

```sql
ignored BOOLEAN NOT NULL DEFAULT false
```

on `account_transactions` in `src/lib/server/schema.ts` (for fresh DBs). Because
the project has **no migration files** — `db.ts` only runs idempotent
`CREATE TABLE IF NOT EXISTS` — existing DBs would never gain the column. So
`initDb()` also runs an idempotent migration after `SCHEMA_SQL`:

```sql
ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS ignored BOOLEAN DEFAULT false
```

DuckDB cannot add a `NOT NULL` column in `ALTER TABLE` (parser error: *"Adding
columns with constraints not yet supported"*), so on migrated DBs the column is
nullable with a `false` default. All queries treat `NULL` as not-ignored
(`ignored IS NOT TRUE` / `ignored = true`). `createTestDb()` runs `SCHEMA_SQL`,
whose `CREATE` already includes the column, so tests get the `NOT NULL` form.

### 3.1 Status taxonomy

`assignment_status` keeps its existing three values. A human-handled row is
`'manual'` — including ignored rows. Ignored vs. categorized is disambiguated by
the `ignored` flag (and by having no category).

| Case | `ignored` | `assignment_status` | `budget_category_month_id` |
|---|---|---|---|
| New import / not yet handled | false | `'unreviewed'` | NULL |
| Rule auto-categorized | false | `'auto'` | set |
| User categorized it | false | `'manual'` | set |
| User ignored it | true | `'manual'` | NULL |
| User un-ignored it | false | `'unreviewed'` | NULL |

Consequences, with no query changes required for review:

- The review queue/list/count stay `assignment_status = 'unreviewed'`; ignored
  rows are `'manual'`, so they drop out and count as reviewed.
- `categorizeUnreviewed` only ever touches `'unreviewed'` rows, so ignored rows
  are never re-categorized by a rule run.
- Assigning a category (`assignTransaction`) also sets `ignored = false`, so
  categorizing an ignored row un-ignores it and preserves the table's invariant.
- Ignoring always clears `budget_category_month_id`, so the `LEFT JOIN` in
  `categoryMonthRows` (`page-data.ts:44`) already excludes the row from spend. A
  defensive `AND (tx.ignored IS NOT TRUE)` is added to that join anyway.

## 4. Behavior

### 4.1 Ignore

Sets `ignored = true`, `assignment_status = 'manual'`,
`budget_category_month_id = NULL`. Reversible.

### 4.2 Un-ignore

Sets `ignored = false`, `assignment_status = 'unreviewed'`,
`budget_category_month_id = NULL`. The transaction reappears in the review queue;
rules are **not** auto-run (the user can press "Run rules").

### 4.3 Review queue UI

- Each row gains an **Ignore** button (single transaction).
- An **Ignore selected** button joins the existing batch form and ignores every
  selected transaction at once, following the same `SvelteSet` selection and
  `invalidateAll()` refresh pattern as batch assign.
- On success, rows leave the queue and the nav badge updates.

### 4.4 Transactions page UI

- The Status filter dropdown gains an `ignored` option. The page maps a selected
  status to filters: `ignored` → `{ ignored: true }`; `manual` → `{ status:
  'manual', ignored: false }`; all other values → `{ status: value }`. So
  selecting `ignored` lists rows with `ignored = true`, and selecting `manual`
  excludes ignored rows.
- The Status column displays `ignored` whenever the flag is set (otherwise the
  `assignment_status` as today). The column renders plain text today, so the page
  computes the label inline (`tx.ignored ? 'ignored' : tx.assignmentStatus`).
- The action cell gains **Ignore** for normal rows and **Un-ignore** for ignored
  rows, alongside the existing category dropdown.

## 5. Implementation surface

| File | Change |
|---|---|
| `src/lib/server/schema.ts` | add `ignored BOOLEAN NOT NULL DEFAULT false` to `account_transactions`; add `MIGRATIONS_SQL` with the idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| `src/lib/server/db.ts` | run `MIGRATIONS_SQL` after `SCHEMA_SQL` in `initDb()` |
| `src/lib/server/repos/transactions.ts` | add `ignored: boolean` to `Transaction` and map it in `rowToTransaction` (treat NULL as false); add `ignored?: boolean` to `TransactionFilters` and apply it in `listTransactions`; add `ignoreTransactions(conn, txIds: string[])` and `unignoreTransaction(conn, txId)` |
| `src/lib/server/repos/transactions.test.ts` | tests for ignore/unignore, the `ignored` filter, and that `countUnreviewed`/`getUnreviewed` exclude ignored rows |
| `src/lib/server/page-data.ts` | add `AND (tx.ignored IS NOT TRUE)` to the `categoryMonthRows` join |
| `src/routes/review/+page.svelte` | per-row **Ignore** button and **Ignore selected** bulk action |
| `src/routes/api/review/ignore/+server.ts` | new; `POST { txIds }` → `ignoreTransactions`, returns `{ ignored: n }` (mirrors `api/review/batch`) |
| `src/routes/transactions/+page.svelte` | `ignored` status filter option; status column shows `ignored`; Ignore/Un-ignore actions |
| `src/routes/api/transactions/[id]/ignore/+server.ts` | new; `POST` → `ignoreTransactions(conn, [id])` |
| `src/routes/api/transactions/[id]/unignore/+server.ts` | new; `POST` → `unignoreTransaction(conn, id)` |
| `AGENTS.md` | document the `ignored` column and that `'manual'` also covers ignored rows |

No new rule fields, no parser changes, no changes to review count queries.

## 6. Testing

- **Repo tests** (`transactions.test.ts`): `ignoreTransactions` sets
  `ignored=true`, `assignment_status='manual'`, and clears the category;
  `unignoreTransaction` restores `ignored=false`, `assignment_status='unreviewed'`;
  `countUnreviewed`/`getUnreviewed` exclude ignored rows; the `ignored` filter in
  `listTransactions` returns only ignored rows (and `ignored: false` excludes
  them); bulk ignore handles an empty array as a no-op.
- **Spend test**: a transaction assigned to a category, then ignored, is excluded
  from the category's `spentCents` (via `categoryMonthRows`/`dashboardData`).
- **Existing tests** are unaffected: new imports default to `ignored=false`, and
  rule categorization only touches `'unreviewed'`.
- Full gate before claiming done:
  `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.

## 7. Error handling

- Ignore/un-ignore of an unknown id is a no-op (the `UPDATE` matches zero rows);
  endpoints still return `{ ok: true }`, matching existing assign endpoints.
- `ignoreTransactions` with an empty array returns without issuing SQL.
- If the migration finds the column already present, `ADD COLUMN IF NOT EXISTS`
  is a no-op, so startup is safe to repeat.
