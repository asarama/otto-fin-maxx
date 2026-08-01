# Design Doc — Budgets (`/budgets`)

**Date:** 2026-08-01
**Status:** Draft
**Plan source:** Task 16 — "Budgets page"
**Depends on:** [`shared-components.md`](./shared-components.md)

---

## 1. Purpose

Where the budget is *defined* and where a single month is *audited* in detail.

Three jobs:

1. **Structure** — owners → budgets → categories. Create budgets and categories.
2. **Limits** — set and change each category's monthly limit.
3. **Month view** — spent vs. limit per category for any month, not just the current one.

The Dashboard answers "are we okay?" at a glance. This page answers "what exactly is the plan, and how did we do against it in March?"

The hardest thing this page has to communicate is the **snapshot model**: `budget_categories.monthly_limit_cents` is the *default going forward*, while `budget_category_months.amount_cents` is *what the limit actually was* in a given month. Every editing affordance has to be honest about which one it is changing.

---

## 2. Files

| File | Status | Role |
|---|---|---|
| `src/routes/budgets/+page.server.ts` | plan | Load structure + month snapshot |
| `src/routes/budgets/+page.svelte` | plan | Page |
| `src/routes/api/budgets/+server.ts` | plan | `POST` create budget |
| `src/routes/api/budgets/[id]/categories/+server.ts` | plan | `POST` create category |
| `src/routes/api/budget-categories/[id]/+server.ts` | plan | `PATCH` limit |

---

## 3. Layout

```
   Budgets                                          ‹  [2026-07]  ›  This month
   Owners → budgets → categories
   ─────────────────────────────────────────────────────────────────────────────

   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │ BUDGETED   │ │ SPENT      │ │ REMAINING  │
   │ $3,200.00  │ │ $2,481.09  │ │   $718.91  │
   └────────────┘ └────────────┘ └────────────┘

   ╭─ Family ─────────────────────────────── $1,840.12 / $2,200.00 ─────────╮
   │                                                                        │
   │  Household                                        [+ Add category]     │
   │  ┌───────────────────────────────────────────────────────────────────┐ │
   │  │ ⬤ Groceries      $712.40 / [ 600.00 ]   -$112.40   over  ✎ 🗓     │ │
   │  │   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▌                       │ │
   │  │ ⬤ Dining out     $340.00 / [ 400.00 ]     $60.00         ✎ 🗓     │ │
   │  │   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░                             │ │
   │  │ ⬤ General          $0.00 / [   0.00 ]   no limit set     ✎ 🗓     │ │
   │  └───────────────────────────────────────────────────────────────────┘ │
   ╰────────────────────────────────────────────────────────────────────────╯

   ╭─ Me ──────────────────────────────────────── $520.00 / $500.00 ────────╮
   │  Personal                                         [+ Add category]     │
   │  …                                                                     │
   ╰────────────────────────────────────────────────────────────────────────╯

   ╭─ Wife ─ no budgets yet ────────────────────────── [+ Add budget] ──────╯

                                                       [+ Add budget]
```

### Region specs

**Header** — `<PageHeader title="Budgets" subtitle="Owners → budgets → categories">` with `<MonthPicker>` in the actions slot. When viewing a month other than the current one, a `<InlineBanner tone="info">` sits directly under the header: *"Viewing July 2026. Limits shown are that month's snapshot."* — see §4.

**Summary tiles** — three `<StatTile>`s (Budgeted / Spent / Remaining) for the viewed month, same treatment as the Dashboard. They are a smaller, three-up grid here because the detail below is the point.

**Owner sections** — one per owner from `listOwners`, **including owners with no budgets**. The plan renders a flat table of month rows, which means an owner with nothing set up is invisible and there is no obvious place to click "add a budget for Wife". Each section is:

- `<h2>` with the owner name in Figtree 600, and the owner's month totals right-aligned with `tabular-nums`.
- A thin `<BudgetMeter>` under the owner header spanning the section width — the owner-level roll-up.
- One sub-block per budget (`<h3>`, `--text-md` 700), each with an `[+ Add category]` ghost button.
- A category table per budget.
- An `[+ Add budget]` ghost button at the end of the owner section.

Section chrome: `<Card>` at `--radius-xl` — borderless, like every card. The owner name is an `h2` inside the card at its top-left, and the three owner cards are separated by `--space-6` of page peach, which is what makes them read as three distinct sheets.

**Category row** — `<DataTable>` with a meter sub-row, matching the Dashboard's treatment so the two pages feel like the same data:

| Column | Render |
|---|---|
| Category | `<CategoryTag>` |
| Spent | `<MoneyText tone="spend">`, mono, end |
| Limit | **editable** `<AmountInput>` inline, mono, end |
| Remaining | `<MoneyText tone="auto">`, mono, end |
| Status | `over` / `near` / blank, `--text-xs` 600 in `--text-negative` (over) or `--text-primary` (near) |
| Actions | `✎` rename category · `🗓` history |

Sub-row: full-width `<BudgetMeter>`.

**Inline limit editing** — the Limit cell is a live `<AmountInput>` (dollars in, cents out). It commits on blur or `Enter`, reverts on `Esc`, and shows `busy` while saving. This is the plan's behavior, kept — editing a limit is the most common action on this page and a modal for it would be friction. What changes is the *wording around it* (§4) and the conversion path (`dollarsToCents`, not a regex over a formatted string).

**Add forms** — the plan puts two always-visible forms ("Add budget", "Add category") at the top of the page with a budget dropdown to choose the parent. This design instead places the action at the point of use: `[+ Add category]` inside the budget it belongs to, `[+ Add budget]` inside the owner section. Clicking expands a compact inline form (name + limit for categories; name only for budgets) with Save/Cancel. The parent is implied by location, so the dropdown — and the class of "added it to the wrong budget" mistake — disappears.

---

## 4. Communicating the snapshot model

This is the design problem unique to this page. Three cases, three treatments:

| Viewing | Editing the limit does | UI |
|---|---|---|
| **Current month** | Updates `budget_categories.monthly_limit_cents` **and** re-snapshots this month's `budget_category_months.amount_cents` | Input is fully editable. Hint under the section: *"Changing a limit updates this month and all future months. Past months keep the limit they had."* |
| **A future month** | Same call, same effect — but the future month's row was already materialized by whichever page loaded it first, so it will be re-snapshotted only if it happens to be the current month. **It will not be.** | Input is **read-only** with a `🔒` and a tooltip: *"Future months use the current limit. Change it from this month."* A `[Go to this month]` link is offered. |
| **A past month** | Would not change history — `updateBudgetCategoryLimit` only touches the current month's snapshot | Input is **read-only** with a `🔒`: *"July 2026 is closed. This was the limit that month."* |

The rule in one sentence, and it should appear verbatim in the UI: **limits are edited for the current month; past months keep what they had.**

This is stricter than the plan (which renders an editable input for every month, silently writing to a different month's snapshot than the one on screen) and it eliminates the page's one genuinely confusing interaction.

**History affordance** — the `🗓` action opens a small popover listing that category's `budget_category_months` rows: month, limit, spent. It is a read-only three-column list, cheap to build, and it makes the snapshot model concrete by *showing* the history instead of explaining it. Requires `listCategoryMonths(conn, categoryId)` (§5.4).

---

## 5. Data model interactions

### 5.1 Reads

```ts
const month = url.searchParams.get('month') ?? currentMonth();
listOwners(conn)              // every owner, including empty ones
listBudgets(conn)             // for grouping; owner_id is the join key
listBudgetCategories(conn)    // for categories with no month row yet
// + the month roll-up query below
```

```sql
SELECT bcm.id, bcm.budget_category_id, bcm.amount_cents,
       bc.name AS category_name, b.id AS budget_id, b.name AS budget_name,
       o.id AS owner_id, o.name AS owner_name,
       COALESCE(SUM(-at.amount_cents), 0) AS spent_cents
FROM budget_category_months bcm
JOIN budget_categories bc ON bc.id = bcm.budget_category_id
JOIN budgets b            ON b.id  = bc.budget_id
JOIN owners o             ON o.id  = b.owner_id
LEFT JOIN account_transactions at ON at.budget_category_month_id = bcm.id
WHERE bcm.month = ?
GROUP BY bcm.id, bcm.budget_category_id, bcm.amount_cents,
         bc.name, b.id, b.name, o.id, o.name
ORDER BY o.name, b.name, bc.name
```

Added to the plan's query: `b.id` and `o.id`, needed to build the owner → budget → category tree without matching on display names (two owners could name a budget the same thing).

`Number(...)` coercion on `amount_cents` and `spent_cents`.

### 5.2 Writes

| Action | Repo call | Effect |
|---|---|---|
| Add budget | `createBudget({ ownerId, name })` | Insert `budgets` |
| Add category | `createBudgetCategory({ budgetId, name, monthlyLimitCents })` | Insert `budget_categories` |
| Edit limit | `updateBudgetCategoryLimit(id, cents)` | Update `budget_categories.monthly_limit_cents` **and** re-snapshot the current month's `budget_category_months.amount_cents` |
| Load the page | `ensureBudgetCategoryMonth(catId, month)` per category | Insert missing `budget_category_months` rows for the viewed month |

The load-time materialization is the same side effect the Dashboard has, and the same caveat applies: **viewing a future month freezes that month's limits at today's values.** On this page it is more likely to be triggered deliberately (someone clicks `›` to plan ahead), which is exactly why future-month limit inputs are locked with an explanation rather than silently editable.

### 5.3 Tables touched

| Table | Access |
|---|---|
| `owners` | read |
| `budgets` | read, insert |
| `budget_categories` | read, insert, update (`monthly_limit_cents`, `name`) |
| `budget_category_months` | read, insert (`ensure`), update (current-month re-snapshot) |
| `account_transactions` | read (spend aggregation only) |

Nothing on this page deletes. There is no "delete category" — a category with history cannot be removed without orphaning `budget_category_months` and, transitively, `account_transactions.budget_category_month_id`. See §10.

### 5.4 Repo amendments (Task 8)

```ts
renameBudgetCategory(conn, id: string, name: string): Promise<void>       // new — the ✎ action
renameBudget(conn, id: string, name: string): Promise<void>               // new
listCategoryMonths(conn, budgetCategoryId: string): Promise<             // new — the 🗓 popover
  { month: string; amountCents: number; spentCents: number }[]
>
listBudgetCategoriesLabelled(conn): Promise<                              // new — shared with Review/Rules/Transactions
  { id: string; name: string; budgetName: string; ownerName: string }[]
>
```

Validation to add in the repo (currently absent, and the API layer should not be the only guard):

- Category name must be unique within its budget (`UNIQUE(budget_id, name)` is not in the schema; enforce in the repo with a clear error, or add the constraint in a schema revision).
- `monthlyLimitCents` must be a non-negative integer. A negative limit produces a meter that can never be satisfied and a "remaining" figure that reads as a windfall.

---

## 6. API routes

### 6.1 `POST /api/budgets`

**Request** `{ "ownerId": "uuid", "name": "Household" }`
**Response** `200 { id, owner_id, name }`

| Status | When |
|---|---|
| 400 | `name` empty, or `ownerId` unknown |
| 409 | Owner already has a budget with that name |

### 6.2 `POST /api/budgets/[id]/categories`

**Request** `{ "name": "Groceries", "monthlyLimitCents": 600 }`

⚠️ **Naming defect in the plan.** The field is called `monthlyLimitCents` but the handler does `Math.round(Number(body.monthlyLimitCents) * 100)` — so it is actually receiving *dollars*. Anyone reading the endpoint (or writing a script against it) will send cents and get a category with a 100× limit. Fix: rename the wire field to **`monthlyLimitDollars`**, or send real cents and drop the multiplication. This doc assumes the second — **the API takes cents**, and `AmountInput`/`dollarsToCents` does the conversion client-side, consistent with "cents everywhere" in the shared doc. The same fix applies to `PATCH /api/budget-categories/[id]`.

**Response** `200 { id, budget_id, name, monthly_limit_cents }`

| Status | When |
|---|---|
| 400 | `name` empty; `monthlyLimitCents` negative or non-integer |
| 404 | Budget id unknown |
| 409 | Duplicate category name in this budget |

### 6.3 `PATCH /api/budget-categories/[id]`

**Request** `{ "monthlyLimitCents": 65000 }` and/or `{ "name": "Groceries & household" }`
**Response** `200 { "ok": true, "monthlyLimitCents": 65000, "currentMonthUpdated": true }`

`currentMonthUpdated` tells the client whether the visible month's snapshot changed, so the UI knows whether to update the meter or only the default.

| Status | When |
|---|---|
| 400 | Negative / non-integer cents; empty name |
| 404 | Category id unknown |

### 6.4 `GET /api/budget-categories/[id]/months` *(new)*

Backs the 🗓 history popover. **Response** `[{ month, amountCents, spentCents }]`, newest first.

---

## 7. States

| State | Treatment |
|---|---|
| **Fresh install** | Three owners exist (seeded: Me, Wife, Family), each with one budget and a "General" category at a $0 limit. The page shows all three sections with a `tone="info"` banner: *"Set a monthly limit on a category to start tracking against it."* |
| **Owner with no budgets** | Section renders with an inline `<EmptyState>` — *"No budgets for Wife yet"* — and a prominent `[+ Add budget]`. |
| **Budget with no categories** | *"No categories in Household"* + `[+ Add category]`. |
| **All limits $0** | Meters use the "no limit set" dashed treatment; Remaining tiles show em-dashes. No `NaN`, no `Infinity%`. |
| **Saving a limit** | Input `busy`, meter dims; on success the meter animates to its new width over `--motion-mid` — the visual confirmation *is* the feedback, plus a quiet toast. |
| **Save fails** | Input reverts to the prior value, keeps focus, error appears under the field via `<Field error>`. |
| **Past / future month** | Limit inputs read-only with a lock and the explanatory hint from §4. |
| **Loading** | Skeleton section cards on first paint; month navigation keeps the current content and shows the header progress line. |

---

## 8. Interactions & accessibility

- **Month navigation** via `<MonthPicker>` → `goto('?month=…', { noScroll: true })`. Not a full page reload (the plan sets `window.location.href`).
- **Owner sections are landmark regions** (`<section aria-labelledby>`), so screen-reader users can jump owner to owner.
- **Inline forms** trap nothing — they are in-flow. `Esc` cancels and returns focus to the button that opened them; the name field is autofocused on open.
- **Limit inputs** are real `<input type="number" step="0.01" inputmode="decimal">` with `aria-label="{category} monthly limit in dollars"`, right-aligned with `tabular-nums`, with a `$` adornment. Read-only months set `readonly` (not `disabled`) so the value stays selectable and screen-reader-accessible, plus `aria-describedby` pointing at the lock explanation.
- **Meters** are `role="meter"` with the same labelling as the Dashboard.
- **Status column** carries the redundant text cue ("over", "near") so colour is never load-bearing.
- **Tab order** runs owner → budget → category rows → add buttons, matching visual order.

---

## 9. Deviations from the plan (Task 16)

1. **Tree layout replaces the flat table** — the spec asks for an "owners → budgets → categories tree"; the plan renders one flat table and drops owners with no budgets entirely.
2. **Add forms move to the point of use**, removing the parent-selection dropdowns.
3. **Limit editing is locked on non-current months**, with an explanation (§4). The plan renders an editable input on every month while `updateBudgetCategoryLimit` only ever writes the current month's snapshot.
4. **`monthlyLimitCents` actually carries cents** (§6.2) — the plan's endpoints multiply a field named `…Cents` by 100.
5. **`centsToDollars(...).replace(/[$,]/g, '')` replaced by `centsToDollarString`** — the plan round-trips a locale-formatted string back into a number input.
6. **`goto()` replaces `window.location.href`** for month changes.
7. **New:** category/budget rename, per-category month history, `GET /api/budget-categories/[id]/months`.
8. **`b.id` / `o.id` added to the roll-up query** so the tree is built on ids, not names.
9. **Owner-level roll-up meters added** (also feeds the Dashboard's per-owner section).

## 10. Open questions

- **Deleting or archiving a category.** Not designed, because it is not safe as the schema stands: `budget_category_months` rows are referenced by `account_transactions`, so a delete either cascades into transaction history or fails on a foreign key. The right shape is an `archived_at` column on `budget_categories` — hidden from pickers, still rendered in past months. Needs a schema change and a decision; deliberately out of scope here.
- **Copy last month's limits.** A `[Copy from June]` action on a fresh month would be useful once limits are actually being tuned month to month. Cheap to add on top of `listCategoryMonths`; not needed for v1 since limits are expected to be near-static.
- **Owner-level limits.** The data model has no concept of a limit on a *budget* or an *owner*, only on a category. The roll-ups here are sums of category limits. If someone wants "Family can spend $2,000/month total, however they like", that is a schema change, not a UI change.
