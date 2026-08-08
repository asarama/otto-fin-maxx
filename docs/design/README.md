# Finance App — Page Design Docs

**Date:** 2026-08-01
**Status:** Draft

Per-page design documentation, extracted from the approved [design spec](../superpowers/specs/2026-08-01-finance-app-design.md) and the [implementation plan](../superpowers/plans/2026-08-01-finance-app.md), and expanded with the detail those two do not carry: visual design, component decomposition, data-model interactions per page, API contracts including error cases, and state coverage.

All visual language derives from the dashboard mockup and [`styles/styles.css`](../../styles/styles.css), which is structured in two tiers: **primitives** (raw hues named by colour and lightness — `--pink-500`, `--cream-200`) and **roles** (what a colour is for — `--surface-primary`, `--text-negative`, `--accent`). Components reference roles only. The full vocabulary, the contrast audit, and the non-colour scales are in [`shared-components.md` §3](./shared-components.md#3-tokens).

## Read in this order

| Doc | Route | Plan task |
|---|---|---|
| **[shared-components.md](./shared-components.md)** | — | 12 (partly) |
| [dashboard.md](./dashboard.md) | `/` | 12 |
| [transactions.md](./transactions.md) | `/transactions` | 17 |
| [review-queue.md](./review-queue.md) | `/review` | 18 |
| [budgets.md](./budgets.md) | `/budgets` | 16 |
| [accounts.md](./accounts.md) | `/accounts` | 13 |
| [vendors.md](./vendors.md) | `/vendors` | 14 |
| [rules.md](./rules.md) | `/rules` | 15 |

**Start with `shared-components.md`.** It defines the tokens, the component catalog, the client utilities (`apiFetch`, money/month helpers), and the cross-page conventions every page doc assumes. The page docs reference components by name and do not redefine them.

## Structure of a page doc

Each follows the same outline: Purpose → Files → Layout → Shared components used → Data model interactions → API routes → States → Interactions & accessibility → Deviations from the plan → Open questions.

The **Deviations** section in each doc is the actionable part for implementation: it lists, task by task, where this design departs from the plan and why — including several functional defects in the planned code (shared `$state` bound across list rows on Vendors/Rules/Review, discarded import results on Accounts, editable limit inputs on closed months, `monthlyLimitCents` fields that carry dollars).

## Cross-cutting amendments this design requires

Collected from the individual docs so the plan can be updated in one pass.

**New files**

- `styles/tokens.css` (space, radius, type, motion — `styles.css` owns colour), `src/app.css`, `static/fonts/*`
- `src/routes/+layout.server.ts` — unreviewed count for the nav badge
- `src/lib/components/**` — the component catalog
- `src/lib/client/api.ts` (`apiFetch`), `src/lib/client/toasts.svelte.ts`
- `src/lib/month.ts`, `src/lib/ui/{tone,group,describeRule,aggregate}.ts`
- `src/routes/api/rules/preview/+server.ts`
- `src/routes/api/vendors/[id]/+server.ts`, `src/routes/api/vendors/[id]/aliases/[aliasId]/+server.ts`
- `src/routes/api/budget-categories/[id]/months/+server.ts`

**Repo amendments**

| Repo | Addition |
|---|---|
| `transactions` | `sort`/`dir`/`limit`/`offset`/`vendorId`/`budgetCategoryId` filters; `countTransactions` |
| `budgets` | `listBudgetCategoriesLabelled`, `listCategoryMonths`, `renameBudget`, `renameBudgetCategory` |
| `accounts` | `listAccountsWithStats` |
| `vendors` | `resolveUnmatchedTransactions`, `removeVendorAlias`, `renameVendor` |
| `rules` | `normalizeRulePriorities`; `deleteRule` must clear `rule_vendors` |
| `matchers/rules` | `explainMatch(rule, tx)` alongside `ruleMatches` |
| `money` | `dollarsToCents`, `centsToDollarString` |

**Contract corrections**

- `POST /api/budgets/[id]/categories` and `PATCH /api/budget-categories/[id]` name their field `monthlyLimitCents` but multiply by 100 — they take dollars. Make them take cents.
- `POST /api/review/create-rule` must validate `descriptionMatcher` with `isValidRegex`, matching `POST /api/rules`.
- `POST /api/transactions/[id]/assign` should derive the month from the transaction row server-side, as `/api/review/batch` already does.
- Rename, update, delete and move endpoints should 404 on unknown ids instead of returning `{ ok: true }`.

**Behavioral**

- Filter/month navigation uses `goto()`, not `window.location.href`.
- Every `*_cents` and count column selected in an ad-hoc load query needs `Number(...)` coercion — DuckDB returns `BigInt`, which will not serialize across the load boundary.

## Open questions spanning multiple pages

1. **Deletion / archival.** Categories, accounts and vendors all have the same problem: rows are referenced by transaction history, so a hard delete either cascades into that history or fails on a foreign key. The consistent answer is an `archived_at` column on each — hidden from pickers, still rendered in past data. It is a schema change and a product decision, and it is deliberately unresolved in all three docs rather than answered differently in each.
2. **Vendor matching strictness.** `resolveVendor` is exact-after-normalization, which will miss bank strings carrying per-transaction reference codes. Whether to loosen it is answerable only against real Capital One / BMO exports; the Vendors page's unmatched-strings panel is the instrument that measures how bad it is.
3. **The feature-card green fails AA.** No light foreground clears 4.5:1 on `--green-500` `#639922`; the mockup's cream-on-green sits at 2.9:1, below even the large-text floor. Deepening the primitive to `#497415` fixes it at 4.7:1 and, because it is a tier-1 change, moves nothing else. Needs a yes/no.
4. **Font.** Figtree (~90 KB, one variable woff2) is self-hosted, with IBM Plex Mono for raw bank strings and regex only. If the mockup was drawn in SF Pro and that look is required exactly, the `-apple-system` fallback reproduces it on macOS.
5. **Rail icons.** The mockup shows placeholder squares; seven icons are needed. Lucide's stroked set matches the geometry. Icons alone are ambiguous regardless of which set wins, so tooltips plus `aria-label` are mandatory.
