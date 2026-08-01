# Finance App — Design Spec

**Date:** 2026-08-01
**Status:** Approved by user during brainstorming

## Overview

A local, single-user web app for tracking household spending against budgets. Two people (me + wife) use one shared instance running on a single local machine. All data lives in a local DuckDB file; SvelteKit is the only component that touches the database.

## Goals

- Import transaction CSVs from Capital One and BMO (USA) accounts.
- Automatically categorize each debit into a budget category via rules.
- Track monthly spend vs. monthly limits per budget category, with no rollover.
- Keep history stable when limits change later (per-month snapshots).

## Non-Goals

- No bank API integration (Plaid/other) — CSV import only, though the data model is designed so a connector could be added later.
- No authentication / multi-user login — one shared local app.
- No income tracking.
- No budget rollover between months.
- No cloud deployment.

## Terminology

| Term | Meaning |
|---|---|
| Account | A real bank/credit connection (Capital One, BMO). |
| Budget | A container owned by an Owner (Me, Wife, Family). |
| Budget Category | A named category inside a Budget, e.g. "Gaming", "General". Has a default monthly limit. |
| Budget Category Month | A per-month snapshot instance of a Budget Category. |
| Vendor | A merchant, with a main display name and 0-many aliases it appears as in statements. |
| Rule | A matcher that assigns an unreviewed transaction into a Budget Category. |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  SvelteKit app (Svelte 5 runes)                 │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  Browser UI — runes-driven components     │   │
│  └──────────────┬───────────────────────────┘   │
│                 │ fetch()                       │
│  ┌──────────────▼───────────────────────────┐   │
│  │  SvelteKit Server (load + API routes)     │   │
│  │  — THE ONLY thing that touches DuckDB      │   │
│  └──────────────┬───────────────────────────┘   │
│                 ▼                               │
│  ┌──────────────────────────────────────────┐   │
│  │  DuckDB file  (data/finance.db, gitignored) │ │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

- **Framework:** SvelteKit with Svelte 5 runes (`$state`, `$derived`, `$props`).
- **Database:** DuckDB via the official `@duckdb/node-api` package, opened as a single file DB server-side.
- **CSV parsing:** `csv-parse` on the server; one parser per bank format.
- **Run:** `npm run dev` (or built `node build`) on one local machine.

## Data Model

All money stored as integer cents. DuckDB schema:

```
owners
  id, name
  -- seeded: Me, Wife, Family

accounts
  id, name, bank ('capital_one' | 'bmo'), type ('credit'|'debit'),
  currency, created_at

budgets
  id, owner_id FK, name, created_at

budget_categories
  id, budget_id FK, name, monthly_limit_cents, created_at

budget_category_months
  id, budget_category_id FK, month ('YYYY-MM'), amount_cents,
  UNIQUE(budget_category_id, month)
  -- amount_cents snapshotted from monthly_limit_cents at month creation

vendors
  id, name, created_at
  -- main user-facing name

vendor_aliases
  id, vendor_id FK, name, created_at
  -- alternate names a vendor appears as in statements

account_transactions
  id, account_id FK, external_id, posted_date, description,
  raw_vendor_name, amount_cents (negative = debit), vendor_id FK NULL,
  budget_category_month_id FK NULL,
  assignment_status ('auto' | 'manual' | 'unreviewed')

rules
  id, name, description_matcher (regex, NULL if unused),
  amount_operator ('any'|'eq'|'lt'|'lte'|'gt'|'gte'), amount_cents NULL,
  budget_category_id FK (target), priority, enabled

rule_vendors
  rule_id FK, vendor_id FK
```

### Key decisions

- **Integer cents** everywhere; no floating-point money.
- **Dedupe** by `account_transactions.external_id` (stable hash of the bank's row); re-importing a CSV never duplicates.
- **`budget_category_months` snapshots** keep history stable: changing `monthly_limit_cents` affects only months created afterward.
- **Rules target `budget_category_id`**; assignment points at the month instance for the transaction's posted month (auto-created if missing).
- **Amount operator** compares debit magnitude, not signed value (e.g. `lt` 5000 = under $50).
- **`raw_vendor_name`** preserves the vendor string exactly as it appeared in the CSV; `vendor_id` is the resolved canonical vendor.

## Data Flow

### Import (CSV → account_transactions)

1. User uploads a CSV against a specific `account`.
2. Rows parsed with the bank's parser, deduped by `external_id`, new rows inserted.
3. Vendor resolution: match `raw_vendor_name` against `vendor_aliases`/vendor names; set `vendor_id` when found, else leave NULL.

### Categorization

1. Run rules in priority order over unreviewed transactions.
2. A rule matches when all of its set criteria pass: `description_matcher` regex, any qualifying `rule_vendors` (if any), and the amount operator.
3. First match wins → set `budget_category_month_id` (auto-creating the month row if needed) and `assignment_status='auto'`.
4. No match → remains `'unreviewed'` in the review queue for manual assignment → `'manual'`.

### Budget & reporting

- Each month, every budget category gets its `budget_category_months` row (amount from `monthly_limit_cents`).
- Spent vs. limit computed by summing that month's transactions per `budget_category_month_id`. No rollover.

### Manual overrides

- Re-running rules only touches `'unreviewed'` transactions; `'auto'` and `'manual'` assignments are never overwritten without an explicit user action.

## UI Pages

- **Dashboard** — current month spent vs. limit per budget category, overspent alerts, recent uncategorized count, per-owner totals.
- **Transactions** — filterable/sortable list (account, vendor, month, status); manual re-assign; raw vs. resolved vendor visible.
- **Review queue** — unreviewed transactions; batch-assign, or create a rule from a transaction.
- **Budgets** — owners → budgets → categories tree; edit monthly limits; per-month spend vs. limit.
- **Accounts** — add/rename accounts; import CSVs here.
- **Vendors** — manage vendors + aliases (merge, add alias).
- **Rules** — CRUD for matchers; priority ordering; enable/disable; "test against a transaction" preview.

All reads via server load functions; all mutations via `+server.ts` endpoints.

## Error Handling

- CSV import: row-level errors collected and reported (e.g. "row 14: missing date"); valid rows still import.
- Bad/malformed rule regex reported clearly, never crashes a batch.
- DuckDB: one lazily-opened connection reused server-side; errors surface as friendly messages.

## Testing

- Unit tests for pure logic: rule matcher, per-bank CSV parsers, dedupe, vendor matching — using real Capital One / BMO CSV samples.
- Integration tests for server routes against an in-memory DuckDB.
- No browser/E2E layer in v1.

## Ops

- DuckDB file at `data/finance.db` (gitignored); schema committed separately for recreation.
- CLI seed script: owners (Me, Wife, Family) and each budget's General category.
- Optional sample-data seed for playing with the UI before real CSVs.
- Backups = copying the single `.db` file.

## Tech Stack

- SvelteKit (Svelte 5 runes)
- DuckDB via `@duckdb/node-api`
- `csv-parse` for CSV handling
- Node.js runtime
