# Design Doc — Dashboard (`/`)

**Date:** 2026-08-01
**Status:** Draft
**Plan source:** Task 12 — "App shell, navigation, and Dashboard"
**Depends on:** [`shared-components.md`](./shared-components.md)

---

## 1. Purpose

The one screen you open to answer: **"are we okay this month?"**

Three questions in priority order:

1. Is any category over its limit right now?
2. How much of the month's total budget is spent?
3. Is anything sitting uncategorized, quietly making those numbers wrong?

Everything else is a link to another page. The Dashboard is read-only — it has no forms, no mutations, and no destinations other than Review, Budgets, and Transactions.

The plan's version is a flat table of every category sorted by overspend. That answers question 1 only if you read every row. This design puts the answer above the table.

---

## 2. Files

| File | Status | Role |
|---|---|---|
| `src/routes/+layout.svelte` | plan | Wraps `<AppShell>`, imports `../app.css`, hosts `<ToastHost>` |
| `src/routes/+layout.server.ts` | **new** | `unreviewedCount` for the nav badge |
| `src/routes/+page.server.ts` | plan | Dashboard load |
| `src/routes/+page.svelte` | plan | Dashboard page |

No API routes. No client-side mutations.

---

## 3. Layout

```
┌────┐
│ ▪  │   July 2026                            ‹  [ Jul 2026 ]  ›
│    │   Household spending against budget
│ ▣  │
│ ▫  │   ⚠  Groceries and Gaming are over budget this month.   [Budgets →]
│ ▫⁴ │   ⓘ  4 transactions are uncategorized and not counted   [Review →]
│ ▫  │      below.
│ ▫  │
│ ▫  │   ╭───────────╮ ╭───────────╮ ╭───────────╮ ╭───────────╮
│ ▫  │   │ Spent     │ │ Budgeted  │ │ Remaining │ │ Over      │
│    │   │ $2,481.09 │ │ $3,200.00 │ │   $718.91 │ │   2 of 9  │
│    │   │ 78% of mo │ │ 9 cats    │ │ 12 days   │ │ categories│
│    │   ╰───────────╯ ╰───────────╯ ╰───────────╯ ╰───────────╯
│    │
│    │   ╭────────────────────────────────────────────────────────╮
│    │   │ By owner                                               │
│    │   │ Family   ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▭▭▭▭▭   $1,840 / $2,200      │
│    │   │ Me       ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▌    $520 / $500  over  │
│    │   │ Wife     ▬▬▬▬▬▬▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭      $121 / $500        │
│    │   ╰────────────────────────────────────────────────────────╯
│    │
│    │   Categories                        sorted by most over ▾
│    │   ╭────────────────────────────────────────────────────────╮
│    │   │ Category     Owner / Budget    Spent   Limit  Remaining│
│    │   │                                                        │
│    │   │ ⬤Groceries   Family/Household $712.40 $600.00 -$112.40 │
│    │   │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▌                │
│    │   │ ⬤Gaming      Me / Personal    $120.00 $100.00  -$20.00 │
│    │   │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▌                │
│    │   │ ⬤Dining out  Family/Household $340.00 $400.00   $60.00 │
│    │   │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▭▭▭▭▭▭▭▭▭▭▭▭▭▭                     │
│    │   ╰────────────────────────────────────────────────────────╯
└────┘
```

Rail icons top to bottom: logo, Dashboard (active), Transactions, Review (badged `⁴`), Budgets, Accounts, Vendors, Rules. Cards are borderless `--surface-primary` slips on the `--surface-page` peach; meter fills are `--accent` on `--surface-track`.

### Region specs

**Header** — `<PageHeader title={monthLabel(data.month)} subtitle="Household spending against budget">` with `<MonthPicker>` in the `actions` slot. The month is the page's identity, so it is the `h1`, not a filter tucked into a toolbar.

**Alert stack** — zero to two `<InlineBanner>`s, in this order:

- `tone="danger"`, shown when `overCount > 0`: *"{names} {is|are} over budget this month."* Names up to three categories, then "and N more". Action link → `/budgets`.
- `tone="warning"`, shown when `unreviewed > 0`: *"{n} transaction{s} {is|are} uncategorized and not counted below."* Action link → `/review`. The wording matters: uncategorized spend is **missing** from every figure on this page, and the user needs to know the totals are provisional.

When both are absent the stack renders nothing — no "all good!" placeholder. Silence is the good state.

**Stat row** — four `<StatTile>`s in a `<Card>` grid (`repeat(4, 1fr)`, gap `--space-4`; 2-up under 900 px, 1-up under 620 px).

| Tile | Value | Sub |
|---|---|---|
| Spent | `<MoneyText cents={totalSpent} tone="spend" size="xl">` | `{pct}% of budget` |
| Budgeted | `<MoneyText cents={totalLimit} tone="neutral">` | `{n} categories` |
| Remaining | `<MoneyText cents={totalLimit - totalSpent} tone="auto">` | `{daysLeft} days left` (current month only; omitted for past/future months) |
| Over | `{overCount} of {n}` in Figtree | `categories` |

The Remaining tile is the only one that changes colour: negative → `--text-negative`. When `totalLimit === 0` (nothing budgeted yet) the tile shows an em-dash and the sub reads "no limits set".

**By owner** — a `<Card>` with one `<BudgetMeter showLabel>` row per owner, ordered by percent-of-limit descending. This is the spec's "per-owner totals" requirement; it is derived client-side from `data.categories`, so it costs no extra query. Rows with `limitCents === 0` are grouped last and show the "no limit set" meter treatment.

**Categories table** — `<DataTable>`, one row per `budget_category_months` row for the month. Columns:

| Column | Render | Align |
|---|---|---|
| Category | `<CategoryTag name={categoryName}>` | start |
| Owner / Budget | `{ownerName} / {budgetName}` in `--text-secondary` `--text-sm` | start |
| Spent | `<MoneyText tone="spend">` | end, mono |
| Limit | `<MoneyText tone="neutral">` | end, mono |
| Remaining | `<MoneyText tone="auto">` | end, mono |

Each row is followed by a full-width sub-row containing `<BudgetMeter>` spanning the table — the meter reads as an underline beneath its figures rather than being squeezed into a column. Over-budget rows also carry a 2 px `--text-negative` left border.

Rows are links: clicking navigates to `/transactions?month={month}&category={budgetCategoryId}`, so "why is Groceries over?" is one click. The whole row is wrapped in a stretched-link anchor (`<a>` on the category cell with an `::after` overlay) so it stays a real link — right-clickable, middle-clickable, keyboard-focusable.

Sort order defaults to `spent - limit` descending (the plan's ordering — most over first), which is correct: the thing you need to see is at the top.

---

## 4. Shared components used

| Component | Where |
|---|---|
| `AppShell`, `NavRail`, `ReviewBadge` | Layout (all pages) |
| `ToastHost` | Layout |
| `PageHeader` | Title + month picker |
| `MonthPicker` | Header actions |
| `InlineBanner` | Overspend + unreviewed alerts |
| `Card`, `StatTile` | Stat row, owner card |
| `MoneyText` | Every figure |
| `BudgetMeter` | Owner rows, category sub-rows |
| `DataTable` | Categories table |
| `CategoryTag` | Category column |
| `EmptyState` | No categories yet |

---

## 5. Data model interactions

### 5.1 Reads

`budget_category_months` ⋈ `budget_categories` ⋈ `budgets` ⋈ `owners`, left-joined to `account_transactions` on `budget_category_month_id`, grouped and filtered to `bcm.month = :month`. This is exactly the plan's query; the design keeps it and adds nothing.

```sql
SELECT bcm.id, bcm.budget_category_id, bcm.amount_cents,
       bc.name AS category_name, b.name AS budget_name, o.name AS owner_name,
       COALESCE(SUM(-at.amount_cents), 0) AS spent_cents
FROM budget_category_months bcm
JOIN budget_categories bc ON bc.id = bcm.budget_category_id
JOIN budgets b            ON b.id  = bc.budget_id
JOIN owners o             ON o.id  = b.owner_id
LEFT JOIN account_transactions at ON at.budget_category_month_id = bcm.id
WHERE bcm.month = ?
GROUP BY bcm.id, bcm.budget_category_id, bcm.amount_cents, bc.name, b.name, o.name
ORDER BY spent_cents - bcm.amount_cents DESC
```

Note the `LEFT JOIN` + `COALESCE`: a category with no transactions must still appear with `$0` spent. `bcm.budget_category_id` is added to the plan's select list because the row link needs it.

Plus `countUnreviewed(conn)` from the transactions repo.

`Number(...)` coercion is required on `amount_cents` and `spent_cents` — DuckDB hands back `BigInt` and it will not serialize across the load boundary.

### 5.2 Writes

One, and it is a side effect of reading:

```ts
for (const row of await conn.runAndReadAll('SELECT id FROM budget_categories')) {
  await ensureBudgetCategoryMonth(conn, String(row.id), month);
}
```

Loading the Dashboard for a month **materializes that month's snapshots** for every category, copying `monthly_limit_cents` into `budget_category_months.amount_cents`. This is the mechanism that makes limit history stable, and it is worth understanding its consequence:

> Visiting the Dashboard for a future month freezes that month's limits at today's values.

For a two-person local app that is acceptable and invisible. It is documented here because it is the kind of thing that looks like a bug two years later. If it ever matters, the fix is to snapshot lazily at assignment time rather than at read time.

### 5.3 Derived client-side (no extra queries)

```ts
const totalSpent  = $derived(data.categories.reduce((s, c) => s + c.spentCents, 0));
const totalLimit  = $derived(data.categories.reduce((s, c) => s + c.amountCents, 0));
const overCats    = $derived(data.categories.filter(c => c.amountCents > 0 && c.spentCents > c.amountCents));
const byOwner     = $derived(groupSum(data.categories, c => c.ownerName));
const daysLeft    = $derived(data.month === currentMonth() ? daysRemainingInMonth() : null);
```

`groupSum` and `daysRemainingInMonth` live in `$lib/month.ts` / a small `$lib/ui/aggregate.ts`; both are pure and unit-tested.

### 5.4 Month parameter

The plan hardcodes the current month. This design reads `?month=YYYY-MM` (defaulting to `currentMonth()`), matching the Budgets page, so the month picker works and the URL is shareable/bookmarkable. Invalid values (not `/^\d{4}-\d{2}$/`) fall back to the current month rather than erroring.

---

## 6. API routes

**None.** Both loads are server load functions. There is nothing to mutate from this page.

| Consumed repo function | From |
|---|---|
| `ensureBudgetCategoryMonth` | `$lib/server/repos/budgets` |
| `countUnreviewed` | `$lib/server/repos/transactions` |

---

## 7. States

| State | Treatment |
|---|---|
| **First run** — no accounts, no categories | `<EmptyState title="Nothing to show yet" body="Add an account and import a CSV to get started." action="Go to Accounts →">`. Stat row and owner card are hidden entirely, not rendered as zeros. |
| **Categories exist, no transactions** | Full layout renders with `$0.00` spent and full meters empty. `<InlineBanner tone="info">` — *"No transactions imported for {month} yet."* with a link to Accounts. |
| **Categories exist, all limits are 0** | Meters render in the "no limit set" treatment; Remaining tile shows an em-dash; a `tone="info"` banner links to Budgets. No division by zero anywhere. |
| **Unreviewed > 0** | Warning banner (§3) plus the nav badge. |
| **Loading** | Navigation progress line under the header; `SkeletonRows` for the table on first paint. |
| **Error** | A load-level failure (DB unopenable) renders SvelteKit's `+error.svelte` with the DuckDB message and a "the app couldn't open `data/finance.db`" explanation. |

---

## 8. Interactions & accessibility

- **Month picker:** `‹`/`›` step one month via `addMonths`; both push a new URL with `goto(..., { noScroll: true })`. "This month" appears only when off the current month.
- **Row activation:** click or `Enter` on a focused row link → filtered transactions. Row hover raises `--surface-hover` and the meter fill brightens 4 %.
- **Reading order:** `h1` (month) → banners → stats → owners → table. A screen reader hits the alerts before the numbers.
- **Meters:** `role="meter"` with `aria-label="{category}: {spent} spent of {limit}"`. Over-budget rows additionally carry a visually-hidden "over budget" so colour is never the only signal — the negative Remaining figure and the `-` sign are the visible redundant cues.
- **Tabular alignment:** all four money columns are `tabular-nums` so decimal points line up down the column.
- **No auto-refresh.** Data changes only when the user does something, and every mutation elsewhere calls `invalidateAll()`.

---

## 9. Deviations from the plan (Task 12)

1. **`+layout.server.ts` added** for `unreviewedCount`.
2. **Layout markup replaced** — the plan's `<style>` block puts `body`, `table`, `th`, `td` rules inside a component `<style>`, where Svelte's scoping means they will not apply to `body` at all and only apply to tables in that one component. Global element styling moves to `src/app.css`.
3. **`?month=` supported** rather than current-month-only.
4. **Alerts, stat row and owner breakdown added** — the spec asks for "overspent alerts, recent uncategorized count, per-owner totals" and the plan's table delivers none of the three.
5. **`bcm.budget_category_id` added to the select list** for row links.
6. **`currentMonth()` moves to `$lib/month.ts`** (it is duplicated in the plan's dashboard and budgets loads).

## 10. Open questions

- **"Days left" on the Remaining tile** assumes the month being viewed is the current one; for past months the sub-label is omitted. An alternative is a burn-rate projection ("on pace for $3,410") — deliberately deferred, since with two people and one machine the numbers are small enough to read directly.
- **Should the Dashboard include income?** No — income tracking is an explicit non-goal. Credits still reduce category spend when assigned, which is why `the income green` green is reserved for positive amounts rather than being handed out to categories.
