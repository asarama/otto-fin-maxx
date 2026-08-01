# Otto Fin Maxx

A local, single-user web app for tracking household spending against budgets. Built for two people running on one machine, with all data in a local DuckDB file.

CSV transactions from our **Capital One** and **BMO (USA)** accounts are imported, automatically categorized into budget categories by rules, and tracked month-over-month against per-category limits.

## How it works

```
accounts  (Capital One, BMO cards)
    │  CSV import
    ▼
account_transactions
    │  rules (description regex + vendors + amount)
    ▼
budget categories  (e.g. "Gaming", "General")  →  per-month snapshots
    │
    ▼
spent vs. limit per month   (no rollover — each month resets)
```

The hierarchy: **owners** (Me, Wife, Family) → **budgets** → **budget categories** → **per-month budget instances**. Each budget starts with a **General** category.

Unmatched transactions land in a **review queue** for manual assignment — nothing is silently miscategorized.

## Tech stack

- [SvelteKit](https://svelte.dev/) with Svelte 5 **runes**
- [DuckDB](https://duckdb.org/) via the official `@duckdb/node-api` package
- [`csv-parse`](https://csv.js.org/parse/) for per-bank CSV parsing
- Node.js

All database interaction happens server-side through SvelteKit load functions and API routes; the browser never touches DuckDB directly.

## Getting started

Prerequisites: Node.js 20+.

```bash
npm install
npm run dev
```

Open the printed localhost URL. First run seeds the defaults (owners: Me, Wife, Family) and creates the DuckDB file at `data/finance.db`.

## Importing transactions

1. Go to **Accounts**, add each real account (bank: Capital One or BMO, type: credit/debit).
2. Download a statement CSV from the bank's website.
3. Upload it against that account. Rows are deduped, so re-importing the same file is safe.
4. Unmatched transactions appear in the **Review queue** — assign them, or create a rule so it happens automatically next time.

## Configuration & data

- Database file: `data/finance.db` (gitignored — your money data stays local)
- Schema: recreated by the app's init/seed step
- Backups: just copy the `data/finance.db` file

## Project layout

```
src/
  lib/server/       DuckDB connection + data access (server-only)
  lib/parsers/      Per-bank CSV parsers (capital_one, bmo)
  lib/matchers/     Rule matching logic
  routes/           SvelteKit pages + API endpoints
docs/
  superpowers/specs/  Full design spec
```

## Docs

- [Full design spec](docs/superpowers/specs/2026-08-01-finance-app-design.md) — data model, data flow, and design decisions
