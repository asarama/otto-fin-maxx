# Design Doc — Review Queue (`/review`)

**Date:** 2026-08-01
**Status:** Draft
**Plan source:** Task 18 — "Review queue page"
**Depends on:** [`shared-components.md`](./shared-components.md)

---

## 1. Purpose

Everything the rules could not categorize lands here. The page has exactly one goal: **get the queue to zero**, fast, and preferably in a way that stops the same transaction from coming back next month.

Two ways out for each transaction:

1. **Assign it** — one-off. Batch-assignable, since imports produce runs of similar rows.
2. **Turn it into a rule** — assign it *and* every future transaction like it.

Path 2 is the one that matters. A review queue that only lets you assign is a treadmill; the design pushes rule creation to equal prominence and shows, before you commit, how many rows in the current queue a proposed rule would clear.

---

## 2. Files

| File | Status | Role |
|---|---|---|
| `src/routes/review/+page.server.ts` | plan | Load unreviewed + option data |
| `src/routes/review/+page.svelte` | plan | Page |
| `src/routes/api/review/batch/+server.ts` | plan | Batch assign |
| `src/routes/api/review/create-rule/+server.ts` | plan | Create rule from a transaction |
| `src/routes/api/rules/preview/+server.ts` | **new** | Dry-run a draft rule (shared with the Rules page) |

---

## 3. Layout

```
   Review queue                                            14 to review
   ────────────────────────────────────────────────────────────────────

   ┌ Group by: ( Vendor )( Description )( None )   Sort: newest ▾ ────┐

   ▾ SQ *BLUE BOTTLE COFFEE                          3 rows · $19.75
   ┌──────────────────────────────────────────────────────────────────┐
   │ ☑  2026-07-12   -$6.25   CapOne    SQ *BLUE BOTTLE COFFEE        │
   │ ☑  2026-07-09   -$6.25   CapOne    SQ *BLUE BOTTLE COFFEE        │
   │ ☑  2026-07-02   -$7.25   CapOne    SQ *BLUE BOTTLE COFF 41       │
   │                                        [Assign ▾]  [Make a rule] │
   └──────────────────────────────────────────────────────────────────┘

   ▾ WALMART #1234                                    2 rows · $121.40
   ┌──────────────────────────────────────────────────────────────────┐
   │ ☐  2026-07-11  -$54.20   BMO       WALMART #1234                 │
   │ ☐  2026-06-28  -$67.20   BMO       WALMART #1234                 │
   │                                        [Assign ▾]  [Make a rule] │
   └──────────────────────────────────────────────────────────────────┘

  ┌ sticky action bar ────────────────────────────────────────────────┐
  │ 3 selected · $19.75    [Category ▾]  [Assign 3]     [Make a rule] │
  └───────────────────────────────────────────────────────────────────┘
```

### Region specs

**Header** — `<PageHeader title="Review queue" subtitle="{n} transaction{s} waiting">`. When the queue is empty the whole page collapses to the empty state (§7).

**Grouping control** — a segmented control: **Vendor** (default), **Description**, **None**.

Grouping is the single highest-leverage feature on this page. Unreviewed transactions arrive in clusters — the same coffee shop eight times — and reviewing them as a flat list means eight identical decisions. Grouping is computed client-side from the loaded rows (§5.3), so it costs nothing:

- **Vendor** — groups by `vendorId`, falling back to a normalized `rawVendorName` for rows where vendor resolution failed. The unresolved-vendor groups are the interesting ones and sort first.
- **Description** — groups by the longest common prefix of `description` after stripping trailing digits/reference codes (`SQ *BLUE BOTTLE COFF 41` and `SQ *BLUE BOTTLE COFFEE` land together).
- **None** — flat, newest first.

**Group card** — a `<Card>` per group with a header row: group name (mono, `--text-primary`), row count, summed amount, a group-level `<Checkbox>` (tri-state: none / some / all), and a `▾` collapse toggle. Group actions `[Assign ▾]` and `[Make a rule]` operate on the whole group regardless of individual selection — that is the fast path.

**Transaction row** — deliberately not a `<DataTable>`; these are cards, and rows are:

```
☐  2026-07-12   -$6.25   CapOne   SQ *BLUE BOTTLE COFFEE
                                  raw: SQ *BLUE BOTTLE COFF 41       (only when it differs)
```

Date and amount tabular; account in `--text-secondary` `--text-sm`; description in `--text-primary`. Selected rows get `--accent-subtle`. The whole row is a click target for its checkbox (with the checkbox as the real, focusable control).

**Sticky action bar** — pinned to the bottom of the viewport, visible only when `selected.size > 0`. `--surface-primary`, a lifted shadow, `--radius-lg`, full content width. Contents: "N selected · $X", a category `<SelectInput>`, a primary `[Assign N]`, and a secondary `[Make a rule]`. Slides up 8 px on first selection (`--motion-mid`).

**Make-a-rule modal** — see §4.

---

## 4. The "Make a rule" flow

The plan's version is a `<details>` panel per row with three shared `$state` variables, so typing a rule name for one transaction fills it in for every other transaction on the page. This design replaces it with a modal that owns its own state and previews its effect.

```
  ┌ Make a rule ─────────────────────────────────────────────┐
  │                                                          │
  │  Name        [ Blue Bottle                            ]  │
  │                                                          │
  │  Match description  ◉ exactly this text                  │
  │                     ○ starts with  [SQ *BLUE BOTTLE   ]  │
  │                     ○ custom regex [                  ]  │
  │                       ✓ valid pattern                    │
  │                                                          │
  │  Vendor      [ Blue Bottle Coffee ▾ ]  (optional)        │
  │  Amount      [ any ▾ ] [        ]                        │
  │  Category    [ Family / Household · Dining out      ▾ ]  │
  │                                                          │
  │  ┌ Preview ──────────────────────────────────────────┐   │
  │  │ Matches 3 of 14 unreviewed transactions           │   │
  │  │  · SQ *BLUE BOTTLE COFFEE     -$6.25   2026-07-12 │   │
  │  │  · SQ *BLUE BOTTLE COFFEE     -$6.25   2026-07-09 │   │
  │  │  · SQ *BLUE BOTTLE COFF 41    -$7.25   2026-07-02 │   │
  │  └───────────────────────────────────────────────────┘   │
  │                                                          │
  │  Rules only affect unreviewed transactions.              │
  │                            [Cancel]  [Create rule]       │
  └──────────────────────────────────────────────────────────┘
```

- **Seeded from the transaction (or group)** that launched it: name defaults to the description truncated to 40 chars, description matcher to the escaped full description, vendor to the row's resolved vendor, amount to `any`.
- **Three matcher modes** so a regex is never required: *exactly this text* (`^` + escaped + `$`), *starts with* (`^` + escaped prefix, editable), *custom regex*. The generated pattern is always shown read-only beneath the choice in `--font-mono`, so the user learns what the modes produce.
- **Live validation** — `isValidRegex` runs client-side on every keystroke in custom mode; invalid patterns disable Create and show the error under the field. The server re-validates (`400 Invalid regex`), because client validation is a convenience, not a guarantee.
- **Live preview** — 300 ms debounced `POST /api/rules/preview` (§6.3) returning `{ matchCount, total, samples }`. `<RulePreviewPanel>` renders it. A rule that matches 0 rows shows a warning tone, not an error — it may be intentional (a rule for future transactions).
- **The honest footnote** — "Rules only affect unreviewed transactions" is always visible. It is the single most confusing behavior in the app and it belongs next to the button that triggers it.

On submit: `POST /api/review/create-rule` → `categorizeUnreviewed()` runs server-side → toast reads *"Rule created · {n} transaction{s} categorized"* → `invalidateAll()` → the matching rows disappear from the queue.

---

## 5. Data model interactions

### 5.1 Reads

```ts
getUnreviewed(conn)          // account_transactions WHERE assignment_status = 'unreviewed'
listAccounts(conn)           // → Map<id, name>
listVendors(conn)            // → dropdown + Map<id, name>
listBudgetCategories(conn)   // → assign + rule target dropdowns
listBudgets(conn) / listOwners(conn)   // new: to label categories as "Owner / Budget · Category"
```

The plan's category dropdown shows bare `cat.name`. With three seeded budgets each owning a "General" category, the dropdown reads `General, General, General`. Categories must be labelled **`{owner} / {budget} · {category}`** everywhere they are selectable — this page, Transactions, and Rules. That needs `listBudgets` + `listOwners` in the load, or a single joined query:

```sql
SELECT bc.id, bc.name AS category_name, b.name AS budget_name, o.name AS owner_name
FROM budget_categories bc
JOIN budgets b ON b.id = bc.budget_id
JOIN owners  o ON o.id = b.owner_id
ORDER BY o.name, b.name, bc.name
```

Recommendation: add `listBudgetCategoriesLabelled(conn)` to the budgets repo (Task 8 amendment) and use it on all three pages rather than repeating the join.

### 5.2 Writes

| Action | Effect |
|---|---|
| Batch assign | For each tx: `ensureBudgetCategoryMonth(categoryId, monthOf(tx.posted_date))` → `assignTransaction(txId, bcmId)` → status becomes `'manual'` |
| Create rule | Insert `rules` (+ `rule_vendors`) → `categorizeUnreviewed(conn)` → matching rows get `budget_category_month_id` and status `'auto'` |

**Multi-month batches.** A selection can span months (the queue is not month-filtered). The batch endpoint derives each transaction's month from its own `posted_date` and calls `ensureBudgetCategoryMonth` per row, so a June and a July charge assigned to "Groceries" land in two different snapshots. The plan already does this correctly; the UI reinforces it by showing a hint in the action bar when the selection spans months: *"3 selected across 2 months — each will be filed under its own month."*

**Assign vs. rule produce different statuses.** Batch assign → `'manual'` (rules will never touch those rows again). Rule creation → `'auto'` (a future re-run can re-evaluate them if they somehow return to unreviewed). This distinction is invisible on this page but visible on Transactions, and it is why "Make a rule" is the better default for recurring merchants.

### 5.3 Grouping (client-side, no queries)

```ts
// $lib/ui/group.ts — pure, unit-tested
export function normalizeMerchant(s: string): string   // upper, collapse ws, strip trailing "#1234"/"*A1B2"/digit runs
export function groupUnreviewed(txs, mode: 'vendor' | 'description' | 'none'): Group[]
```

Groups sort by row count descending (biggest win first), then by most recent date. Single-row groups collapse into a trailing "Everything else" group in `vendor`/`description` mode so the page does not become a wall of one-row cards.

### 5.4 Tables touched

| Table | Access |
|---|---|
| `account_transactions` | read (unreviewed), write (assignment + status) |
| `accounts`, `vendors`, `vendor_aliases` | read |
| `budget_categories`, `budgets`, `owners` | read |
| `budget_category_months` | read; insert via `ensureBudgetCategoryMonth` |
| `rules`, `rule_vendors` | insert |

---

## 6. API routes

### 6.1 `POST /api/review/batch`

**Request** `{ "txIds": ["uuid", ...], "budgetCategoryId": "uuid" }`
**Response** `200 { "ok": true, "assigned": 3, "skipped": 0, "categoryName": "Dining out" }`

The plan `continue`s past missing ids silently and returns `{ ok: true }`. Returning `assigned`/`skipped` lets the toast be truthful when a row vanished between load and submit (possible if a rule was created in another tab).

**Errors**

| Status | When |
|---|---|
| 400 | `txIds` empty or not an array; `budgetCategoryId` missing or unknown |
| 404 | *not used* — missing transactions are counted as `skipped`, not fatal |

Per-row work is wrapped in a single transaction (`BEGIN`/`COMMIT`) so a partial batch cannot leave half the selection assigned.

### 6.2 `POST /api/review/create-rule`

**Request**
```json
{
  "name": "Blue Bottle",
  "description": "SQ *BLUE BOTTLE COFFEE",
  "descriptionMatcher": "^SQ \\*BLUE BOTTLE",
  "amountOperator": "any",
  "amountCents": null,
  "vendorId": "uuid|null",
  "budgetCategoryId": "uuid"
}
```

`descriptionMatcher` wins if present; otherwise the server escapes `description` into a literal pattern (the plan's `escapeRegex`). **Amendment:** the server must also run `isValidRegex` on a supplied `descriptionMatcher` and reject with `400 Invalid regex: …`, exactly as `POST /api/rules` does. The plan validates on the Rules endpoint but not this one, which is a hole — the same table ends up with a pattern that can never match and no error was ever shown.

**Response** `200 { rule, categorized: 3 }` — `categorized` is the delta in unreviewed count around the `categorizeUnreviewed()` call, so the toast can say what actually happened.

### 6.3 `POST /api/rules/preview` *(new — shared with the Rules page)*

Dry-runs a rule spec against the current unreviewed set without writing anything.

**Request**
```json
{
  "descriptionMatcher": "^SQ \\*BLUE BOTTLE",
  "amountOperator": "any",
  "amountCents": null,
  "vendorIds": []
}
```

**Response**
```json
{
  "total": 14,
  "matchCount": 3,
  "samples": [
    { "id": "…", "postedDate": "2026-07-12", "description": "SQ *BLUE BOTTLE COFFEE", "amountCents": -625 }
  ]
}
```

Implementation: `getUnreviewed(conn)` → `rules.filter(ruleMatches(spec, tx))` using the existing pure `ruleMatches` from `$lib/matchers/rules`. Read-only, no DB writes, `samples` capped at 5. Returns `400 Invalid regex: …` for a malformed pattern rather than silently reporting 0 matches (`ruleMatches` returns `false` on a bad regex, which would otherwise read as "matches nothing").

This endpoint is what makes rule creation feel safe, and it is why it is worth adding beyond the plan's `/api/rules/[id]/test` (which needs an already-saved rule and only tests a hand-typed transaction).

---

## 7. States

| State | Treatment |
|---|---|
| **Queue empty** | `<EmptyState title="Nothing to review" body="Every transaction is categorized. Imports that don't match a rule will show up here.">` with links to Rules and Transactions. Celebrated quietly — a single `<Card tone="positive">`, no confetti. |
| **Queue emptied during the session** | The last group card fades out (`--motion-mid`) and the empty state fades in. The nav badge disappears via the layout invalidation. |
| **No categories exist yet** | `<InlineBanner tone="warning">` above the queue: *"There are no budget categories to assign to."* with `[Create one →]` to `/budgets`. Assign controls are disabled — there is nothing to pick. |
| **Batch in flight** | Action bar button `busy`; selected rows dim; the bar's count freezes so it does not flicker as rows are removed. |
| **Batch partial** | Toast: *"Assigned 2 of 3 — 1 transaction was already categorized."* |
| **Preview loading** | Preview panel shows a 2-line skeleton, never a spinner; the Create button stays enabled (preview is advisory, not a gate). |
| **Preview error** | Panel shows *"Couldn't preview this rule"* in `--notice`; Create remains enabled unless the regex is invalid. |

---

## 8. Interactions & accessibility

- **Keyboard-first, because this is bulk work:**
  - `j` / `k` or `↓` / `↑` — move the row cursor
  - `Space` — toggle the focused row
  - `Shift+Click` / `Shift+Space` — range-select within a group
  - `a` — select all in the focused group
  - `Esc` — clear selection / close modal
  - `Enter` on the action bar's category select — assign
  Shortcuts are listed in a `?` popover from the header and are disabled while a text input has focus.
- **Selection is a `Set<string>` in `$state`**, replaced (not mutated) on change so runes track it — as the plan does.
- **Tri-state group checkbox** uses `indeterminate` and `aria-checked="mixed"`.
- **Sticky action bar** is `role="region"` `aria-label="Bulk actions"` with `aria-live="polite"` on the count, so selection changes are announced.
- **The modal** is a native `<dialog>` (`Modal`), so focus trap and `Esc` come free. Focus lands on the Name field; the preview panel is `aria-live="polite"` and debounced so it does not chatter.
- **Group headers** are `<h2>`s inside the card, keeping the heading outline meaningful when navigating by heading.

---

## 9. Deviations from the plan (Task 18)

1. **Grouping by vendor/description added** — the plan renders a flat `<ul>`.
2. **Per-row `<details>` rule form replaced by a modal** with isolated state. The plan's shared `ruleName` / `ruleVendorId` / `ruleCategoryId` variables are bound across every row simultaneously, so filling in one row fills in all of them and "Create rule" on row 7 uses whatever was typed under row 2.
3. **`POST /api/rules/preview` added** (§6.3).
4. **`create-rule` validates `descriptionMatcher`** with `isValidRegex` (parity with `POST /api/rules`).
5. **`batch` returns counts** and runs inside one DB transaction.
6. **Category dropdowns are labelled `owner / budget · category`** — requires `listBudgetCategoriesLabelled` (Task 8 amendment).
7. **Sticky bulk action bar** replaces the top-of-page assign form.
8. **Keyboard shortcuts** for triage.

## 10. Open questions

- **Should "Make a rule" also back-fill already-`manual` transactions?** No, by spec — manual wins. But after creating a rule it would be reasonable to offer *"12 older transactions match this rule but are already categorized — review them?"* as a link to Transactions filtered by that pattern. Deferred; it needs a matcher-driven filter the repo does not have.
- **Auto-suggest a category** for each group based on prior manual assignments of the same vendor. A cheap heuristic ("last time you filed WALMART under Groceries") would cut the work further. Out of scope for v1 — it is a second, implicit rules engine and it should not exist alongside the explicit one without a deliberate decision.
- **Grouping heuristic quality** (`normalizeMerchant`) is guesswork until real Capital One and BMO descriptions are in hand. It is pure and unit-tested, so it can be tuned against real fixtures without touching the page.
