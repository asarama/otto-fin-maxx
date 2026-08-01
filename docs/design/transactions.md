# Design Doc — Transactions (`/transactions`)

**Date:** 2026-08-01
**Status:** Draft
**Plan source:** Task 17 — "Transactions page"
**Depends on:** [`shared-components.md`](./shared-components.md)

---

## 1. Purpose

The ledger. Every imported row, filterable and sortable, with the ability to re-file any transaction into a different category.

Two jobs:

1. **Find a transaction** — "what was that $86 charge on the 14th?"
2. **Fix a transaction** — a rule put something in the wrong category, or a manual assignment was wrong.

This is the only page that shows both the **raw vendor string** from the bank and the **resolved vendor**, which makes it the place you go when vendor matching is misbehaving.

The Review queue (a separate page) handles *unassigned* transactions in bulk. This page handles *any* transaction, one at a time.

---

## 2. Files

| File | Status | Role |
|---|---|---|
| `src/routes/transactions/+page.server.ts` | plan | Load with filters |
| `src/routes/transactions/+page.svelte` | plan | Page |
| `src/routes/api/transactions/[id]/assign/+server.ts` | plan | Re-assign one transaction |

---

## 3. Layout

```
   Transactions                                       1,204 rows · $8,412 spent
   ────────────────────────────────────────────────────────────────────────────

   ┌─ filters ────────────────────────────────────────────────────────────────┐
   │ 🔍 [search description…]  [2026-07]  [All accounts ▾]  [All vendors ▾]   │
   │ Status:  ( All )( Unreviewed )( Auto )( Manual )        [Apply] Clear (2)│
   └──────────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────┐
   │ DATE ▾    DESCRIPTION            VENDOR      ACCOUNT   AMOUNT   CATEGORY │
   │ ──────────────────────────────────────────────────────────────────────── │
   │ 2026-07-14 AMZN MKTP US*2H4…     Amazon      CapOne   -$86.40  ⬤Shopping│
   │            AMZN MKTP US 2H4KL9                                    auto   │
   │ 2026-07-13 SHELL OIL 574812      Shell       BMO      -$38.90  ⬤Transport│
   │                                                                   manual │
   │ 2026-07-12 SQ *BLUE BOTTLE       —           CapOne   -$ 6.25   [assign ▾]│
   │            SQ *BLUE BOTTLE COFF                              unreviewed  │
   └──────────────────────────────────────────────────────────────────────────┘
                              [ Load 100 more ]   showing 100 of 1,204
```

### Region specs

**Header** — `<PageHeader title="Transactions">` with a live count + summed amount for the *current filter* in the subtitle slot. That summary is the reason to run a filter at all ("how much did we spend at restaurants in July?"), so it sits next to the title with `tabular-nums`.

**Filter bar** — `<FilterBar>` containing, in order:

| Control | Component | Query param |
|---|---|---|
| Search description | `TextInput` with a leading 🔍 and `type="search"` | `search` |
| Month | `MonthInput` with a "Any month" clear affordance | `month` |
| Account | `SelectInput` | `account` |
| Vendor | `SelectInput` | `vendor` |
| Status | segmented pill group (All / Unreviewed / Auto / Manual) | `status` |
| Category | hidden control; set only when arriving from the Dashboard | `category` |

Status is a segmented control rather than a dropdown because it is the filter that gets toggled most and it has exactly four values. Active segment: `--accent-subtle` bed, `--accent-strong` label, `aria-pressed="true"`.

The bar submits on `Enter`, on segment click, and on select change; the search box debounces 250 ms. "Clear (N)" appears when any filter is set and resets to `/transactions`.

**Table** — `<DataTable>` with a two-line row. This is the key layout decision:

```
line 1:  date · description · vendor · account · amount · category
line 2:           raw_vendor_name (muted, mono, --text-xs)     · status badge
```

The raw bank string is almost always noise (`AMZN MKTP US*2H4KL9XY2`) but it is exactly what you need when vendor matching fails — so it is present on every row, subordinated to a second line in `--text-tertiary`-adjacent muted mono rather than hidden behind a disclosure. Line 2 is omitted when `raw_vendor_name` equals `description` (the common case for both parsers today, since both set them identically) — so in practice the second line only appears once they diverge, and its appearance is itself informative.

Columns:

| Column | Render | Align | Sortable |
|---|---|---|---|
| Date | `postedDate` tabular | start | ✔ (default, desc) |
| Description | `--text-primary`, truncated at 44 chars with a `title` | start | ✔ |
| Vendor | resolved vendor name, or `—` in `--text-secondary` when `vendor_id IS NULL` | start | — |
| Account | account name, `--text-sm` `--text-secondary` | start | — |
| Amount | `<MoneyText tone="auto">` — debits `--text-negative`-free neutral `--text-primary`, credits `--text-positive` with a `+` | end, mono | ✔ |
| Category | `<CategoryTag>` + inline re-assign control | start | — |
| Status | `<StatusBadge>` on line 2, right | end | — |

Amount colouring: debits are the norm and are rendered in plain `--text-primary` (colouring 95 % of rows red is noise); **credits** are rendered in `--text-positive` with a leading `+` and pick up the `the income green` treatment when tagged. Green means money in — consistent with the reservation of `the income green` in the shared doc.

**Category cell / re-assign** — the plan puts a bare `<select>` on every row, permanently visible, with a blank "assign category" first option. That is 1,204 selects in the DOM and it makes an accidental scroll-wheel change trivially easy.

Instead:

- **Assigned rows** show `<CategoryTag>`; a `✎` `<IconButton label="Change category">` appears on row hover/focus and switches that one cell into a `<SelectInput>` (autofocused, `Esc` cancels, change commits).
- **Unreviewed rows** show a compact `[assign ▾]` secondary `<Button>` that does the same thing, since for those the action *is* the point.

Only one cell is ever in edit mode; opening another closes the first.

**Pagination** — `limit`/`offset` with a "Load 100 more" button and a "showing N of M" caption. See §5.4.

---

## 4. Shared components used

| Component | Where |
|---|---|
| `PageHeader` | Title + filtered summary |
| `FilterBar` | Filter strip |
| `TextInput`, `MonthInput`, `SelectInput`, `Field` | Filter controls, inline re-assign |
| `Button`, `IconButton` | Apply, load more, re-assign |
| `DataTable` | The ledger |
| `MoneyText` | Amount column, header summary |
| `CategoryTag` | Category cell |
| `StatusBadge` | Status |
| `EmptyState` | No results / no data |
| `Toast` | Assignment feedback |
| `SkeletonRows` | First paint |

---

## 5. Data model interactions

### 5.1 Reads

Primary: `listTransactions(conn, filters)` from `$lib/server/repos/transactions`, joining nothing — the load resolves display names via lookup maps, as the plan does:

- `listAccounts(conn)` → `Map<id, name>` for the account column and the filter dropdown.
- `listVendors(conn)` → `Map<id, name>` for the vendor column and filter dropdown.
- `listBudgetCategories(conn)` → the re-assign dropdown options.
- A `budget_category_months ⋈ budget_categories` query → `Map<bcmId, categoryName>` so an assigned row can name its category.

That last map is loaded unfiltered in the plan (`SELECT bcm.id, bc.name ... FROM budget_category_months bcm JOIN budget_categories bc`). It stays unfiltered — it is one row per (category × month) and will be in the hundreds for years.

**Coercion:** `amount_cents` → `Number(...)`.

### 5.2 Writes

`POST /api/transactions/[id]/assign` performs, in order:

1. `ensureBudgetCategoryMonth(conn, budgetCategoryId, month)` — creating the snapshot from `monthly_limit_cents` if that category has never been used in that month.
2. `assignTransaction(conn, txId, bcm.id)` — sets `budget_category_month_id` **and** `assignment_status = 'manual'`.

**The month is the transaction's posted month, not the filter month.** The client sends `tx.postedDate.slice(0, 7)`; the server should not trust it blindly — see §6.2. Getting this wrong files a July charge against an August budget, and because snapshots are per-month the error is invisible on the Budgets page for the month you were looking at.

**Manual is sticky.** Once `assignment_status = 'manual'`, `categorizeUnreviewed` will never touch the row again, even if a later rule matches it. The UI says so: after a successful re-assign the toast reads *"Moved to {category} · rules will no longer change this transaction."* That is a real consequence of the click and the user should know it happened.

### 5.3 Tables touched

| Table | Access |
|---|---|
| `account_transactions` | read (list), write (`budget_category_month_id`, `assignment_status`) |
| `accounts` | read |
| `vendors`, `vendor_aliases` | read (via `listVendors`) |
| `budget_categories` | read |
| `budget_category_months` | read; **insert** via `ensureBudgetCategoryMonth` |

### 5.4 Repo amendment — sorting, vendor filter, paging

The spec calls this list "filterable/sortable"; the plan's `TransactionFilters` is `{ accountId, month, status, search }` with a fixed order and no limit. This design extends Task 9:

```ts
export interface TransactionFilters {
  accountId?: string;
  vendorId?: string;                                   // new
  budgetCategoryId?: string;                           // new — Dashboard drill-down
  month?: string;
  status?: string;
  search?: string;
  sort?: 'date' | 'amount' | 'description';            // new, default 'date'
  dir?: 'asc' | 'desc';                                // new, default 'desc'
  limit?: number;                                      // new, default 100
  offset?: number;                                     // new, default 0
}
export async function listTransactions(conn, f): Promise<Transaction[]>
export async function countTransactions(conn, f): Promise<{ count: number; sumCents: number }>  // new
```

Implementation notes for whoever writes it:

- `sort`/`dir` map to a **whitelist**, never string-interpolated from the request: `{ date: 'posted_date', amount: 'amount_cents', description: 'description' }` and `dir ∈ {ASC, DESC}`. Everything else is a parameterized `?`.
- Secondary sort is always `posted_date DESC, id` so paging is stable and ties do not shuffle between pages.
- `budgetCategoryId` filters through the month snapshot:
  `at.budget_category_month_id IN (SELECT id FROM budget_category_months WHERE budget_category_id = ?)`.
- `countTransactions` returns both the row count and `SUM(-amount_cents)` for the header summary in one pass.

Sorting by amount sorts on the **signed** value, so the largest debits sort to the bottom on `desc`. The header label reads "Amount ▾ (largest debit first)" when `sort=amount&dir=asc` to make that legible rather than surprising.

---

## 6. API routes

### 6.1 `POST /api/transactions/[id]/assign`

**Request**
```json
{ "budgetCategoryId": "uuid", "month": "2026-07" }
```

**Response** `200 { "ok": true, "categoryName": "Groceries", "month": "2026-07" }`

The plan returns bare `{ ok: true }`. Returning the resolved category name and month lets the toast be specific without a second round-trip.

**Errors**

| Status | When | Message |
|---|---|---|
| 400 | `budgetCategoryId` missing/unknown | `Unknown budget category` |
| 400 | `month` not `YYYY-MM` | `Invalid month: {v}` |
| 404 | transaction id not found | `Transaction not found` |

### 6.2 Server-side month derivation

The handler should **derive the month from the transaction row** rather than accepting the client's value:

```ts
const rows = (await conn.runAndReadAll(
  'SELECT posted_date FROM account_transactions WHERE id = ?', [params.id]
)).getRowObjects();
if (rows.length === 0) throw error(404, 'Transaction not found');
const month = String(rows[0].posted_date).slice(0, 7);
```

This is what `/api/review/batch` already does in the plan (Task 18), and the two endpoints should not disagree about where the month comes from. The client keeps sending `month` for forward compatibility, but the server ignores it. Result: it is structurally impossible to file a transaction into the wrong month's snapshot.

---

## 7. States

| State | Treatment |
|---|---|
| **No transactions at all** | `<EmptyState title="No transactions yet" body="Import a CSV from one of your accounts to fill the ledger." action="Go to Accounts →">`. Filter bar hidden. |
| **Filters match nothing** | `<EmptyState title="No transactions match these filters" action="Clear filters">`. Filter bar stays, with its values intact. |
| **Assigning** | The row's control shows `busy`; the row dims to 70 % opacity; on success a 600 ms `--accent-subtle` flash confirms the change in place, then `invalidateAll()` refreshes. |
| **Assign fails** | Error toast with the server message; the cell reverts to its previous value and stays in edit mode so the user can retry. |
| **Loading more** | The "Load more" button goes `busy`; new rows append (no stagger animation on appended rows — only on first mount). |
| **Loading (navigation)** | Progress line under the header; the existing table stays visible rather than being replaced by skeletons — re-filtering should not blank the screen. |

---

## 8. Interactions & accessibility

- **URL is the state.** Every filter, sort, and page size lives in the query string, applied via `goto(url, { keepFocus: true, noScroll: true, replaceState: true })`. The plan sets `window.location.href`, which full-reloads the app, drops focus out of the search box mid-typing, and scrolls to top on every filter change.
- **Sorting** is a `<button>` inside `<th>` with `aria-sort="ascending|descending|none"`. Clicking the active column flips direction.
- **Inline edit:** `Enter`/`Space` on the `✎` button opens the select and focuses it; `Esc` restores the tag and returns focus to the button; changing the value commits and returns focus to the button.
- **Row focus** is visible via `:focus-within` raising `--surface-hover` plus the standard focus ring on the focused control.
- **Screen readers:** the table has a `<caption class="visually-hidden">` describing the active filter set ("Transactions, July 2026, all accounts, unreviewed only — 14 rows"), so the filter context is announced without reading the toolbar.
- **Amount column** is `tabular-nums`, right-aligned; the `-`/`+` sign is inside the cell, not a separate column, so copy-paste of a column yields usable values.

---

## 9. Deviations from the plan (Task 17)

1. **`goto()` replaces `window.location.href`** for filter application.
2. **Vendor filter, category filter, sorting, and paging added** — requires the Task 9 repo amendment in §5.4.
3. **Header shows filtered count + sum**, via new `countTransactions`.
4. **Per-row `<select>` replaced** by a hover/focus-revealed inline editor.
5. **Raw vendor name surfaced** on a secondary line (the spec requires "raw vs. resolved vendor visible"; the plan renders `tx.vendorName ?? tx.rawVendorName`, which shows the raw name *only when there is no resolved vendor* — the opposite of what is needed for debugging vendor rules).
6. **Assign endpoint derives the month server-side** and returns the category name.
7. **Manual-assignment stickiness is stated in the UI**, not left as a silent side effect.

## 10. Open questions

- **Bulk actions here too?** The Review queue owns multi-select. If re-filing many already-categorized transactions becomes common (e.g. after renaming a category), the same selection machinery could be enabled here behind a "Select" toggle. Deferred — no evidence it is needed, and it complicates the row layout.
- **CSV export of the current filter.** Cheap to add (`GET /api/transactions/export?...` streaming the same query) and genuinely useful at tax time. Not in the spec; noted as a candidate follow-up.
- **Description truncation at 44 chars** is a guess. If real Capital One descriptions run longer, the second line already exists to absorb the overflow.
