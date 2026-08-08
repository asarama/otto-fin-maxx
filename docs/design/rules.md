# Design Doc — Rules (`/rules`)

**Date:** 2026-08-01
**Status:** Draft
**Plan source:** Task 15 — "Rules page"
**Depends on:** [`shared-components.md`](./shared-components.md)

---

## 1. Purpose

The automation. A rule says: *when an unreviewed transaction looks like this, file it under that category.*

Four jobs:

1. **Author** rules — description pattern, vendor(s), amount comparison → target category.
2. **Order** them — first match wins by ascending priority.
3. **Enable / disable / delete** without losing the others.
4. **Understand** what a rule will do *before* saving it.

Job 4 is the design's centre of gravity. Rules are the only part of the app that acts on the user's behalf, they run on a first-match-wins ladder where order changes outcomes, and they are expressed partly in regex. Any of those alone justifies a preview; together they make it mandatory.

**The other thing this page must communicate:** rules only ever touch `assignment_status = 'unreviewed'` transactions. Creating, editing, or reordering rules will not re-file anything already categorized. Users will expect the opposite.

---

## 2. Files

| File | Status | Role |
|---|---|---|
| `src/routes/rules/+page.server.ts` | plan | Load rules, categories, vendors |
| `src/routes/rules/+page.svelte` | plan | Page |
| `src/routes/api/rules/+server.ts` | plan | `POST` create |
| `src/routes/api/rules/[id]/+server.ts` | plan | `PATCH` update, `DELETE` |
| `src/routes/api/rules/[id]/move/+server.ts` | plan | `POST` reorder |
| `src/routes/api/rules/[id]/test/+server.ts` | plan | `POST` test against a typed transaction |
| `src/routes/api/rules/preview/+server.ts` | **new** | Dry-run a draft spec against the unreviewed queue |

---

## 3. Layout

```
   Rules                                                       [+ New rule]
   Checked top to bottom — the first match wins
   ─────────────────────────────────────────────────────────────────────────

   ⓘ Rules only apply to transactions that haven't been categorized yet.
     14 unreviewed transactions · 11 would match a rule below      [Review →]

   ┌──────────────────────────────────────────────────────────────────────┐
   │ #  RULE                    MATCHES                CATEGORY      ON   │
   │ ─────────────────────────────────────────────────────────────────── │
   │ 1  Groceries — Walmart     ^(WM|WALMART)          ⬤Groceries    [◉]  │
   │ ↕                          Walmart · any amount   Family/Household   │
   │                            ▸ matches 4 unreviewed        ✎ ⧉ 🗑     │
   │ ─────────────────────────────────────────────────────────────────── │
   │ 2  Small coffee runs       ^SQ \*                 ⬤Dining out   [◉]  │
   │ ↕                          under $15.00                Family/House  │
   │                            ▸ matches 3 unreviewed        ✎ ⧉ 🗑     │
   │ ─────────────────────────────────────────────────────────────────── │
   │ 3  Amazon  (disabled)      ^AMZN                  ⬤Shopping     [○]  │
   │ ↕                          Amazon, Amazon Prime         Me/Personal  │
   │                            ▸ would match 4              ✎ ⧉ 🗑     │
   └──────────────────────────────────────────────────────────────────────┘

   ┌ Test a transaction against all rules ────────────────────────────────┐
   │  Description [ SQ *BLUE BOTTLE COFFEE ]  Vendor [ none ▾ ]           │
   │  Amount      [ 6.25 ]                                    [Run test]  │
   │                                                                      │
   │  → Rule 2 "Small coffee runs" wins → Dining out                      │
   │    Rule 1 no (description)   Rule 3 no (description)                 │
   └──────────────────────────────────────────────────────────────────────┘
```

### Region specs

**Header** — `<PageHeader title="Rules" subtitle="Checked top to bottom — the first match wins">` and a primary `[+ New rule]`. The subtitle is doing real work: priority order is the page's core mechanic and it should be stated where it cannot be missed.

**Standing banner** — always visible `<InlineBanner tone="info">`: *"Rules only apply to transactions that haven't been categorized yet."* with the live unreviewed count and how many of them any enabled rule would claim. This is the honest framing of the feature and it is repeated in the editor's footer.

**Rules table** — `<DataTable>` in priority order (ascending `priority` = first checked). Each rule is a two-line row:

| Element | Treatment |
|---|---|
| `#` | Position, `--text-secondary`, tabular. Displayed position, not raw `priority` — priorities can be sparse. |
| `↕` | Drag handle (see §8) with `↑`/`↓` `IconButton`s as the accessible equivalent |
| Rule name | `--text-primary` 500 |
| Criteria (line 1) | The regex in `--font-mono` inside a `--surface-secondary` chip |
| Criteria (line 2) | Human-readable summary: vendor names, amount clause — *"Walmart · under $15.00"*. Built by `describeRule()` (§5.5) |
| Category | `<CategoryTag>` + `{owner}/{budget}` beneath in `--text-xs` `--text-secondary` |
| Match count | *"matches N unreviewed"* — a link that opens the preview popover |
| `[◉]` | Enable toggle (a switch, not a button whose label flips) |
| `✎ ⧉ 🗑` | Edit · duplicate · delete |

Disabled rules render at 55 % opacity with the name suffixed *(disabled)*; they keep their position in the ladder because re-enabling must be predictable.

**Rule editor** — a `<Modal>`, opened by `[+ New rule]`, `✎`, or `⧉`. Same component as the Review queue's "Make a rule", with the full field set:

```
  ┌ Edit rule ───────────────────────────────────────────────┐
  │  Name         [ Small coffee runs                     ]  │
  │                                                          │
  │  ── Match when ALL of these are true ──                  │
  │                                                          │
  │  Description  ◉ any                                      │
  │               ○ starts with  [                        ]  │
  │               ○ contains     [                        ]  │
  │               ○ regex        [ ^SQ \*                 ]  │
  │                 ✓ valid                                  │
  │  Vendor       ☑ Blue Bottle Coffee  ☐ Amazon  ☐ Shell    │
  │               (any of the checked vendors)               │
  │  Amount       [ less than ▾ ]  $[ 15.00 ]                │
  │               Compares the size of the charge, ignoring  │
  │               its sign — "less than $15" means under $15 │
  │               spent.                                     │
  │                                                          │
  │  ── Then file it under ──                                │
  │  Category     [ Family / Household · Dining out       ▾] │
  │                                                          │
  │  ┌ Preview ────────────────────────────────────────────┐ │
  │  │ Matches 3 of 14 unreviewed transactions             │ │
  │  │  · SQ *BLUE BOTTLE COFFEE   -$6.25   2026-07-12     │ │
  │  │  · SQ *BLUE BOTTLE COFFEE   -$6.25   2026-07-09     │ │
  │  │  · SQ *BLUE BOTTLE COFF 41  -$7.25   2026-07-02     │ │
  │  │ ⚠ Rule 1 "Groceries — Walmart" already claims 1 of  │ │
  │  │   these. Move this rule above it to win.            │ │
  │  └─────────────────────────────────────────────────────┘ │
  │                                                          │
  │  Saving runs this rule over unreviewed transactions      │
  │  only. Nothing already categorized will move.            │
  │                              [Cancel]  [Save rule]       │
  └──────────────────────────────────────────────────────────┘
```

Design notes on the editor:

- **"Match when ALL of these are true"** is a literal statement of `ruleMatches` semantics: every *set* criterion must pass, unset criteria are ignored. An empty rule matches everything — which is a legitimate catch-all at the bottom of the ladder, so it is allowed but warned about (§7).
- **Four description modes** so regex is opt-in: *any*, *starts with*, *contains*, *regex*. The first three generate escaped patterns (`^…`, `…`) shown read-only beneath the field in `--font-mono`, so users learn the syntax by seeing it. Editing an existing rule detects which mode its pattern came from and falls back to *regex* when it cannot tell.
- **Vendor is `VendorMultiSelect`** (checkbox well), labelled *"any of the checked vendors"* — because `rule.vendorIds` is an OR within an AND, and `<select multiple>` communicates none of that.
- **Amount operator explains itself.** `ruleMatches` compares `Math.abs(tx.amountCents)`, so "less than $15" means a charge smaller than $15 regardless of sign. That is non-obvious enough to state under the field rather than in a doc.
- **The preview names the conflict.** Because first-match-wins, a rule can be correct and still never fire. `POST /api/rules/preview` returns, per matched transaction, which *earlier enabled rule* already claims it (§6.5) — turning "why doesn't my rule work?" into a sentence with a fix in it.

**Test panel** — a persistent `<Card>` at the bottom of the page, not a per-row `<details>`. You type a hypothetical transaction once and see how the **whole ladder** resolves it: the winning rule highlighted, every other rule listed with a one-word reason it did not match (`description`, `vendor`, `amount`). That is strictly more useful than testing one rule in isolation, and it is what a first-match-wins system actually needs.

---

## 4. Shared components used

| Component | Where |
|---|---|
| `PageHeader` | Title + new rule |
| `InlineBanner` | Standing "unreviewed only" notice, warnings |
| `DataTable` | Rules ladder |
| `CategoryTag` | Target category |
| `IconButton` | Move, edit, duplicate, delete |
| `Modal` / `ConfirmDialog` | Editor, delete confirm |
| `Field`, `TextInput`, `SelectInput`, `AmountInput` | Editor fields |
| `VendorMultiSelect` | Vendor criterion |
| `RulePreviewPanel` | Editor preview |
| `Card` | Test panel |
| `EmptyState` | No rules |
| `Toast` | Every mutation |

---

## 5. Data model interactions

### 5.1 Reads

```ts
listRules(conn)                      // rules + rule_vendors → vendorIds[], ordered by priority ASC
listBudgetCategoriesLabelled(conn)   // owner / budget · category (see Budgets doc §5.4)
listVendors(conn)                    // vendor picker + name lookup
countUnreviewed(conn)                // standing banner
```

`listRules` must order by `priority ASC, id` — a stable tiebreak matters because `moveRule` swaps priorities and equal values would otherwise reorder unpredictably between loads.

### 5.2 Writes

| Action | Repo | Tables | Side effect |
|---|---|---|---|
| Create | `createRule(input)` | insert `rules`, insert `rule_vendors` | `categorizeUnreviewed(conn)` |
| Update | `updateRule(id, patch)` | update `rules`, replace `rule_vendors` | `categorizeUnreviewed(conn)` |
| Toggle | `updateRule(id, { enabled })` | update `rules.enabled` | `categorizeUnreviewed(conn)` |
| Reorder | `moveRule(id, dir)` | update `rules.priority` ×2 | `categorizeUnreviewed(conn)` |
| Delete | `deleteRule(id)` | delete `rule_vendors`, delete `rules` | `categorizeUnreviewed(conn)` |

Every mutation re-runs categorization, as the plan specifies. Two consequences the UI must own:

**Re-running is not a rollback.** Deleting or disabling a rule does *not* un-assign the transactions it already filed — those rows are `'auto'`, not `'unreviewed'`, so `categorizeUnreviewed` skips them. The delete confirm says so:

> *"Deleting this rule won't change the 47 transactions it already categorized. Only future unreviewed transactions are affected."*

**Reordering is retroactive only for what is still unreviewed.** Moving a rule up re-runs the ladder over the remaining unreviewed rows, so the effect is real but bounded. The reorder toast reports the delta: *"Moved to position 1 · 2 transactions re-categorized."*

`deleteRule` must remove `rule_vendors` rows first (or the schema needs `ON DELETE CASCADE`); the plan's interface list does not say which, and a bare `DELETE FROM rules` leaves orphaned `rule_vendors` rows that will resurrect as phantom criteria if an id is ever reused.

### 5.3 Priority mechanics

`moveRule(id, 'up' | 'down')` swaps `priority` with the adjacent rule in priority order. Two notes:

- Priorities can be sparse and duplicated (`createRule` defaults to `0`). The UI shows **display positions** (1, 2, 3…) derived from sort order, never the stored number, so a table full of zeros does not look broken.
- Recommended amendment: `normalizeRulePriorities(conn)` — rewrite priorities to `1..n` in current order — called after every create and move. It makes swaps well-defined, keeps new rules from all landing at `priority = 0`, and is a handful of lines. Without it, several rules at `priority = 0` make "up" and "down" no-ops in an order that depends on `id`.

### 5.4 Tables touched

| Table | Access |
|---|---|
| `rules` | read, insert, update, delete |
| `rule_vendors` | read, insert, delete |
| `budget_categories`, `budgets`, `owners` | read (target picker + labels) |
| `vendors`, `vendor_aliases` | read |
| `account_transactions` | read (preview, counts), write via `categorizeUnreviewed` |
| `budget_category_months` | read, insert (auto-created when a rule assigns into a new month) |

### 5.5 `describeRule` — one summary, three places

```ts
// $lib/ui/describeRule.ts — pure, unit-tested
describeRule(rule, { vendors, categories }): {
  matchLine: string;    // "Walmart · under $15.00"
  targetLine: string;   // "Family / Household · Groceries"
}
```

Used by the rules table, the review queue's rule-created toast, and the test panel. Written once so the phrasing of "under $15.00" cannot drift between them. `'any'` operator and empty vendor list produce omitted clauses, not "any amount, any vendor" noise.

---

## 6. API routes

### 6.1 `POST /api/rules`

**Request**
```json
{
  "name": "Small coffee runs",
  "descriptionMatcher": "^SQ \\*",
  "amountOperator": "lt",
  "amountCents": 1500,
  "budgetCategoryId": "uuid",
  "vendorIds": ["uuid"]
}
```
**Response** `200 { rule, categorized: 3 }`

| Status | When | Message |
|---|---|---|
| 400 | Malformed regex | `Invalid regex: (` |
| 400 | Empty `name` | `Name is required` *(added)* |
| 400 | `amountOperator` not in the allow-list | `Invalid amount operator: …` *(added)* |
| 400 | Operator ≠ `any` but `amountCents` is null, or `amountCents` negative | `An amount is required for "less than"` *(added)* |
| 400 | Unknown `budgetCategoryId` or any unknown `vendorId` | `Unknown budget category` *(added)* |

The last one matters: `budget_category_id` is a foreign key, so an unknown id currently surfaces as a raw DuckDB constraint error in a 500.

**Note on `amountCents` semantics.** The wire field is genuine cents (the client converts with `dollarsToCents`), and `ruleMatches` compares it against `Math.abs(tx.amountCents)` — so it is always a positive magnitude. Reject negative values rather than silently comparing against a number that can never match.

### 6.2 `PATCH /api/rules/[id]`
Partial update; same validation as create for any field present. **Response** `200 { ok: true, categorized: 2 }`. 404 on unknown id *(added — the plan's `updateRule` no-ops silently)*.

### 6.3 `DELETE /api/rules/[id]`
**Response** `200 { ok: true, affectedExisting: 47 }` — the count of already-`'auto'` transactions this rule had filed, gathered before deletion, so the confirm dialog and the toast can both be specific. 404 on unknown id.

### 6.4 `POST /api/rules/[id]/move`
**Request** `{ "direction": "up" | "down" }` → **Response** `200 { ok: true, position: 1, categorized: 2 }`. No-op at the ends returns the unchanged position rather than an error.

### 6.5 `POST /api/rules/preview` *(new — shared with the Review queue)*

Dry-runs an unsaved spec. Read-only.

**Request**
```json
{
  "id": "uuid|null",
  "descriptionMatcher": "^SQ \\*",
  "amountOperator": "lt",
  "amountCents": 1500,
  "vendorIds": []
}
```

**Response**
```json
{
  "total": 14,
  "matchCount": 3,
  "samples": [{ "id": "…", "postedDate": "2026-07-12", "description": "SQ *BLUE BOTTLE COFFEE", "amountCents": -625 }],
  "shadowedBy": [{ "ruleId": "…", "ruleName": "Groceries — Walmart", "count": 1 }]
}
```

`shadowedBy` is the differentiating field: for each matched transaction, the server checks whether an **earlier enabled rule** (excluding `id`, so editing a rule does not report it shadowing itself) also matches, and aggregates by that rule. That is what powers the editor's conflict warning.

Implementation: `getUnreviewed(conn)` + `listRules(conn)` + the pure `ruleMatches`. Nothing is written. `400 Invalid regex: …` on a bad pattern rather than reporting zero matches — `ruleMatches` returns `false` for an uncompilable pattern, which would otherwise be indistinguishable from "matches nothing".

### 6.6 `POST /api/rules/[id]/test` (plan) → `POST /api/rules/test` *(reshaped)*

The plan tests **one saved rule** against a typed transaction. The page needs the **whole ladder** evaluated (§3), so the endpoint moves off the `[id]` path:

**Request** `{ "description": "SQ *BLUE BOTTLE COFFEE", "vendorId": null, "amountCents": -625 }`
**Response**
```json
{
  "winner": { "ruleId": "…", "ruleName": "Small coffee runs", "categoryName": "Dining out" },
  "evaluated": [
    { "ruleId": "…", "name": "Groceries — Walmart", "matched": false, "failedOn": "description" },
    { "ruleId": "…", "name": "Small coffee runs",   "matched": true,  "failedOn": null }
  ]
}
```

`failedOn` requires a small addition to the matcher — `explainMatch(rule, tx): { matched: boolean; failedOn: 'description' | 'vendor' | 'amount' | null }` alongside the existing `ruleMatches`, sharing one implementation so they cannot disagree. The per-id endpoint can be kept as a thin wrapper for the plan's verification steps.

---

## 7. States

| State | Treatment |
|---|---|
| **No rules** | `<EmptyState title="No rules yet" body="Rules file new transactions automatically. The easiest way to make one is from a transaction in the review queue." action="Go to review queue →">` with a secondary `[+ New rule]`. |
| **No categories exist** | `[+ New rule]` disabled with a `tone="warning"` banner: *"Create a budget category first — a rule needs somewhere to file transactions."* → `/budgets`. |
| **Rule matches nothing** | Preview shows `tone="info"`: *"Matches none of the 14 unreviewed transactions. That's fine if it's for future transactions."* Save stays enabled. |
| **Rule is fully shadowed** | `tone="warning"`: *"Every transaction this matches is already claimed by an earlier rule. Move it up to take effect."* with a `[Move to top]` action. Save stays enabled. |
| **Empty rule (no criteria set)** | `tone="warning"` in the editor: *"This rule matches every uncategorized transaction. It should probably be last."* Allowed — it is a valid catch-all. |
| **Invalid regex** | `<Field error>` under the input, Save disabled, preview frozen at its last good result rather than showing zero. |
| **Saving** | Modal button `busy`; on success modal closes, the row flashes `--accent-subtle`, toast reports `categorized`. |
| **Reordering** | Row lifts with a lifted shadow while dragging; on drop, positions renumber with a 160 ms transition and the request fires. Failure re-sorts back and toasts. |
| **Deleting** | `ConfirmDialog` (danger) naming `affectedExisting`; on confirm the row collapses. |
| **Loading** | Skeleton rows; match counts populate in a second pass so the ladder renders immediately (counts are the slow part). |

---

## 8. Interactions & accessibility

- **Reordering has two equivalent paths.** Pointer: drag the `↕` handle. Keyboard: focus the handle and use `↑`/`↓` (or the visible `IconButton`s), each firing `POST /api/rules/[id]/move`. Drag-only reordering is inaccessible; the plan's buttons stay as the primary mechanism and drag is layered on top.
- **Position changes are announced** via an `aria-live="polite"` region: *"Small coffee runs moved to position 1 of 3."*
- **The enable toggle** is `role="switch"` with `aria-checked`, labelled by the rule name — not a button whose text flips between "Enable" and "Disable" (which reads ambiguously to a screen reader: is that the state or the action?).
- **Modal editor** is a native `<dialog>`; focus starts on Name; `Esc` cancels with a confirm if the form is dirty.
- **Preview is debounced 300 ms** and `aria-live="polite"` so it does not announce on every keystroke.
- **Regex fields** are `--font-mono`, `spellcheck="false"`, `autocapitalize="off"`, `autocomplete="off"`. A regex silently autocapitalized by the browser is a genuinely miserable bug.
- **Test panel results** are a `<dl>`, with the winner marked by both a `--text-positive` chip and the word "wins" — never colour alone.
- **Table is `<table>` with real `<th scope="col">`**, and the criteria second line lives in the same cell as the pattern (not a separate row) so column semantics stay intact.

---

## 9. Deviations from the plan (Task 15)

1. **Editor moves to a modal** with isolated state. The plan's inline edit form and per-row `<details>` test panel share `testDescription` / `testVendorId` / `testAmount` / `testResult` across every row, so typing in one row's test box fills every row's box.
2. **`POST /api/rules/preview` added** (§6.5), including `shadowedBy`.
3. **Test endpoint evaluates the whole ladder** (§6.6) rather than a single rule, with `explainMatch` for per-rule reasons.
4. **`VendorMultiSelect` replaces `<select multiple>`.**
5. **Description modes** (any / starts with / contains / regex) so a regex is opt-in.
6. **Validation added** for name, amount operator, operator/amount coherence, and foreign keys — the plan validates only the regex.
7. **404s added** on update/delete/move of unknown ids.
8. **`normalizeRulePriorities`** recommended so `moveRule` is well-defined when priorities collide at 0.
9. **`categorized` / `affectedExisting` counts returned** so the UI can say what happened.
10. **Standing "unreviewed only" banner** and explicit delete/reorder copy about non-retroactivity.
11. **Categories labelled `owner / budget · category`** in the target picker (three seeded "General" categories are otherwise indistinguishable).

## 10. Open questions

- **Re-running rules over already-categorized transactions.** The spec forbids overwriting `'auto'`/`'manual'` "without an explicit user action" — which implies such an action could exist. A `[Re-run all rules]` button with a preview of what would move is the natural shape, but it needs a decision about whether `'manual'` is ever eligible (it should not be). Deliberately out of scope; the door is left open by keeping preview logic server-side and reusable.
- **Rule categories vs. transaction months.** A rule targets a `budget_category_id`; assignment resolves to that category's month snapshot for the transaction's posted month, auto-creating it. So an import of six months of history can silently materialize six months of snapshots at today's limits. Correct per the spec, worth a note in the import result panel if it ever surprises anyone.
- **Regex flavour.** `ruleMatches` compiles with the `i` flag and no anchoring, so patterns are case-insensitive substring searches unless anchored. The editor's generated patterns anchor explicitly (`^`), but a hand-written pattern behaves differently from what most people expect from "matches". The hint text under the regex field states it: *"Case-insensitive. Unanchored — use `^` to match from the start."*
