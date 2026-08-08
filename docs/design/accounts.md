# Design Doc — Accounts (`/accounts`)

**Date:** 2026-08-01
**Status:** Draft
**Plan source:** Task 13 — "Accounts page with CSV import"
**Depends on:** [`shared-components.md`](./shared-components.md)

---

## 1. Purpose

The front door for data. Everything in this app arrives through this page.

Two jobs:

1. **Manage accounts** — add and rename the Capital One / BMO accounts that transactions belong to.
2. **Import CSVs** — upload a statement export against an account and see, precisely, what happened to it.

Job 2 is the one that carries weight. A CSV import is the only bulk write in the app, it is partially fallible by design (row-level errors, dedupe, unmatched rules), and it is invisible unless the page reports it. The plan's version fires the request and throws the response away. This design makes the **import result the main event**.

---

## 2. Files

| File | Status | Role |
|---|---|---|
| `src/routes/accounts/+page.server.ts` | plan | Load accounts (+ per-account stats) |
| `src/routes/accounts/+page.svelte` | plan | Page |
| `src/routes/api/accounts/+server.ts` | plan | `GET` list, `POST` create |
| `src/routes/api/accounts/[id]/+server.ts` | plan | `PATCH` rename |
| `src/routes/api/accounts/[id]/import/+server.ts` | plan | `POST` CSV import |

---

## 3. Layout

```
   Accounts                                                  [+ Add account]
   Import statements and manage where transactions come from
   ─────────────────────────────────────────────────────────────────────────

   ╭──────────────────────────────────────────────────────────────────────╮
   │  Capital One Quicksilver              CAPITAL ONE · CREDIT      ✎    │
   │  412 transactions · last import 2026-07-28 · through 2026-07-27      │
   │                                                                      │
   │   ┌ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐    │
   │   ┊   Drop a Capital One CSV here    or  [Choose file]         ┊    │
   │   └ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘    │
   ╰──────────────────────────────────────────────────────────────────────╯

   ╭──────────────────────────────────────────────────────────────────────╮
   │  BMO Checking                                 BMO · DEBIT       ✎    │
   │  118 transactions · last import 2026-07-28 · through 2026-07-26      │
   │                                                                      │
   │   ✓ Imported bmo-july.csv                                            │
   │     ┌────────────────────────────────────────────────────────────┐   │
   │     │  38  imported          2  duplicates skipped               │   │
   │     │  31  auto-categorized  7  need review  →                   │   │
   │     └────────────────────────────────────────────────────────────┘   │
   │     ⚠ 2 rows were skipped                                    [show]  │
   │        Row 14: Unrecognized date: 07-31-26                           │
   │        Row 52: Invalid amount: --38.90                               │
   ╰──────────────────────────────────────────────────────────────────────╯
```

### Region specs

**Header** — `<PageHeader title="Accounts" subtitle="Import statements and manage where transactions come from">` with a primary `[+ Add account]` button in the actions slot, opening an inline form (not a modal — it is three fields and low-stakes).

**Add-account form** — collapsed by default; expands under the header. Fields: Name (`TextInput`, autofocused), Bank (`SelectInput`: Capital One / BMO), Type (`SelectInput`: Credit / Debit). Save + Cancel. The bank choice is permanent in effect — it selects the CSV parser — so a hint under it reads: *"This decides which CSV format is expected. It can't be changed later."*

**Account card** — one `<Card>` per account, in creation order:

| Element | Treatment |
|---|---|
| Name | Figtree 600 `--text-lg` |
| Bank · Type | `--text-xs` 600 `--text-secondary`, sentence case, right-aligned. Bank gets a subtle tint chip: Capital One → `--category-2-surface`, BMO → `--category-3-surface`. Two banks, two fixed colours — this is the one place tone assignment is not hashed. |
| Stats line | `{n} transactions · last import {date} · through {latest posted_date}`, `--text-sm` `--text-secondary`, numbers tabular |
| `✎` | `IconButton label="Rename account"` → swaps the name into an inline `TextInput` (`Enter` saves, `Esc` cancels) |
| Drop zone | `<ImportDropZone accountId>` |

"Through {latest posted date}" is the most useful stat on the card — it answers "have I imported July yet?" without leaving the page.

**Import result panel** — replaces the drop zone in-place after an import completes, with a `[Import another]` ghost button to restore it. A four-cell `<KeyValueList>` grid:

| Cell | Source | Tone |
|---|---|---|
| **imported** | `result.imported` | `--text-positive` when > 0 |
| **duplicates skipped** | `result.duplicates` | `--text-secondary` |
| **auto-categorized** | `result.categorized` | `--text-primary` |
| **need review** | `imported - categorized` | `--notice` when > 0, rendered as a link to `/review` |

Numbers in Figtree `--text-2xl`, labels beneath in `--text-xs` 600 `--text-secondary`.

Below the grid, when `parseErrors.length > 0`, an `<InlineBanner tone="warning">`: *"{n} rows were skipped"* with a `[show]` disclosure listing each error verbatim (`Row 14: Unrecognized date: …`) in `--font-mono` `--text-sm`. Row numbers are 1-based with the header as row 1, matching the parsers, so they can be found directly in the spreadsheet.

The panel is deliberately loud about **duplicates** and **need review** because those are the two numbers that explain a surprising result: "I imported 60 rows and nothing changed" (all duplicates) and "the dashboard total is too low" (rows sitting in review).

---

## 4. Shared components used

| Component | Where |
|---|---|
| `PageHeader` | Title + add button |
| `Section` / `Card` | Account cards |
| `Field`, `TextInput`, `SelectInput` | Add + rename forms |
| `Button`, `IconButton` | Add, save, rename, import another |
| `ImportDropZone` | Per-account upload |
| `KeyValueList` | Import result grid |
| `InlineBanner` | Parse errors, first-run guidance |
| `EmptyState` | No accounts |
| `Toast` | Create / rename feedback |

---

## 5. Data model interactions

### 5.1 Reads

The plan loads `listAccounts(conn)` only. The card's stats line needs three more values per account, in one query rather than N:

```sql
SELECT a.id,
       COUNT(at.id)                        AS tx_count,
       MAX(at.posted_date)                 AS latest_posted,
       MAX(at.created_at)                  AS last_import_at
FROM accounts a
LEFT JOIN account_transactions at ON at.account_id = a.id
GROUP BY a.id
```

`created_at` on `account_transactions` is set at insert time by the import pipeline, so `MAX(created_at)` is a faithful "when did I last import into this account". Coerce `tx_count` with `Number(...)`.

### 5.2 Writes

**Create account** — `createAccount({ name, bank, type })`. Validates `bank ∈ {capital_one, bmo}` and `type ∈ {credit, debit}` in both the repo and the endpoint (the plan does both — keep it; the repo guard is the one that protects scripts).

**Rename account** — `renameAccount(id, name)`. Touches nothing else; transactions reference `account_id`.

**Import** — the heavy one. `POST /api/accounts/[id]/import` runs:

1. `getAccount(id)` → 404 if missing. The account's `bank` selects the parser.
2. `parseBankCsv(account.bank, csvText)` → `{ rows, errors }`. Never throws for bad content; throws only for an unknown bank.
3. `importTransactions(conn, accountId, rows)`, which per row:
   - computes `externalId(accountId, postedDate, description, rawVendorName, amountCents)`,
   - skips rows whose `external_id` already exists → `duplicates++`,
   - inserts the rest → `imported++`,
   - resolves `vendor_id` via `resolveVendor(rawVendorName, vendors)` against `vendors` + `vendor_aliases`,
   - leaves `assignment_status = 'unreviewed'`.
4. `categorizeUnreviewed(conn)` runs rules in priority order over unreviewed rows, creating `budget_category_months` rows as needed and setting `assignment_status = 'auto'` on matches → `categorized`.

So a single import writes to `account_transactions` and `budget_category_months`, and reads `vendors`, `vendor_aliases`, `rules`, `rule_vendors`, `budget_categories`.

### 5.3 Tables touched

| Table | Access |
|---|---|
| `accounts` | read, insert, update (`name`) |
| `account_transactions` | insert; read (dedupe by `external_id`, stats) |
| `vendors`, `vendor_aliases` | read (vendor resolution) |
| `rules`, `rule_vendors` | read (categorization) |
| `budget_categories` | read |
| `budget_category_months` | read, insert (auto-created per matched month) |

### 5.4 Dedupe, honestly

`external_id` is `sha1(accountId | postedDate | description | rawVendorName | amountCents)`. Two genuinely distinct transactions that agree on all five fields — two identical $6.25 coffees at the same shop on the same day, on the same card — hash identically, and the second is counted as a duplicate and dropped.

This is inherent to the CSV format, not a bug in the hash, and the plan says so. The design's obligation is to make it **visible rather than silent**: the result panel always shows the duplicate count, even when it is 0, so a suspicious number is noticeable at the moment of import rather than discovered months later.

The card copy for a fully-duplicate import is specific: *"Nothing new — all 60 rows were already imported."* Not "Imported 0 transactions", which reads like a failure.

### 5.5 Repo amendment (Task 7)

```ts
listAccountsWithStats(conn): Promise<
  (Account & { txCount: number; latestPostedDate: string | null; lastImportAt: string | null })[]
>   // new — one query, replaces listAccounts on this page
```

---

## 6. API routes

### 6.1 `GET /api/accounts`
**Response** `200 Account[]`. Used by scripts and the plan's verification steps; the page itself uses the load function.

### 6.2 `POST /api/accounts`
**Request** `{ "name": "Capital One Quicksilver", "bank": "capital_one", "type": "credit" }`
**Response** `200 Account`

| Status | When | Message |
|---|---|---|
| 400 | `bank` not in the allow-list | `Invalid bank: chase` |
| 400 | `type` not in the allow-list | `Invalid type: prepaid` |
| 400 | `name` empty after trim | `Name is required` *(added — the plan accepts `""`)* |

### 6.3 `PATCH /api/accounts/[id]`
**Request** `{ "name": "CapOne" }` → **Response** `200 { ok: true, name }`

| Status | When |
|---|---|
| 400 | Empty name |
| 404 | Unknown id — *added; the plan's `renameAccount` silently no-ops on a bad id and returns `{ ok: true }`* |

### 6.4 `POST /api/accounts/[id]/import`

**Request** `multipart/form-data` with a single `file` part (`.csv`).

**Response** `200`
```json
{
  "imported": 38,
  "duplicates": 2,
  "errors": [],
  "categorized": 31,
  "parseErrors": ["Row 14: Unrecognized date: 07-31-26"],
  "fileName": "bmo-july.csv",
  "rowsSeen": 42
}
```

`fileName` and `rowsSeen` are additions — the panel names the file it just processed, and `rowsSeen` lets the user verify the arithmetic (`rowsSeen = imported + duplicates + parseErrors.length`). When that identity does not hold, something is wrong and it is visible.

Note there are two error channels and they mean different things:
- **`parseErrors`** — rows the parser rejected (bad date, bad amount). The row never reached the database.
- **`errors`** — failures inside `importTransactions` (an insert that blew up). Rendered in a `tone="danger"` banner, separately from parse errors.

| Status | When | Message |
|---|---|---|
| 400 | No `file` part, or not a `File` | `No file uploaded` |
| 400 | File is empty, or > 10 MB | `File is empty` / `File is too large (max 10 MB)` *(added)* |
| 400 | `parseBankCsv` threw (unknown bank — should be impossible given the account's constrained `bank`) | `Could not parse CSV: …` |
| 400 | Zero parseable rows *and* zero parse errors — i.e. the headers did not match the expected format | `This doesn't look like a {bank} export — no rows recognized.` *(added)* |
| 404 | Unknown account | `Account not found` |

That last one matters: uploading a BMO export to a Capital One account currently yields `imported: 0` with no explanation, because `csv-parse` happily returns rows whose named columns are all `undefined`. Detecting "parsed the file but recognized nothing" and saying so turns a mystery into a one-line fix.

---

## 7. States

| State | Treatment |
|---|---|
| **No accounts** | `<EmptyState title="No accounts yet" body="Add your Capital One or BMO account, then import a CSV export from your bank." action="+ Add account">`. The add form opens expanded. |
| **Account with no transactions** | Stats line reads *"No transactions yet"*; the drop zone is enlarged and carries the format hint (*"Capital One export: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit"*) so the first import is more likely to work. |
| **Dragging a file** | Zone border → `--accent`, bed → `--accent-subtle`, label → *"Release to import"*. Dragging over the *page* (not a zone) dims non-target cards to 60 % so the drop target is unmistakable. |
| **Uploading / importing** | Determinate bar for the upload, then an indeterminate `--accent` shimmer labelled *"Parsing and categorizing…"*. The card is `aria-busy`; other cards stay interactive. |
| **Import succeeded** | Result panel (§3). Card border flashes `--text-positive` for 600 ms. `invalidateAll()` refreshes stats and the nav review badge. |
| **Import succeeded, all duplicates** | *"Nothing new — all {n} rows were already imported."* in `tone="info"`, not a success flash. |
| **Import failed (4xx/5xx)** | `tone="danger"` banner inside the card with the server message and a `[Try again]`. The drop zone stays. |
| **Wrong file type** | Rejected client-side before upload: *"Only .csv files can be imported."* |
| **Renaming** | Inline input with `busy` on save; `Esc` cancels; name reverts and an error appears under the field on failure. |

---

## 8. Interactions & accessibility

- **The drop zone is keyboard-operable**: `role="button"`, `tabindex="0"`, `Enter`/`Space` opens the file picker. A drag-only upload target is unusable without a pointer.
- **`aria-live="polite"`** on the result panel, so the counts are announced when the import finishes. Errors use `assertive`.
- **The file input** is visually hidden but present in the DOM and labelled — not `display: none`, which removes it from the accessibility tree.
- **Rename** keeps focus inside the card: `✎` → input (autofocus, text selected) → save returns focus to `✎`.
- **Bank/type chips** are text, not colour-only; the tint is decoration.
- **One `h1`**, `h2` per account card (the account name), no skipped levels.
- **Parse-error list** is a real `<ol>` so row counts are announced.

---

## 9. Deviations from the plan (Task 13)

1. **Import result is displayed.** The plan calls `fetch` and discards the response, so `imported`, `duplicates`, `categorized`, and `parseErrors` — the entire point of the pipeline's return value — never reach the user.
2. **Drop zone replaces a bare `<input type="file">`** that fires on `change` with no confirmation and no progress.
3. **Per-account stats added** (`listAccountsWithStats`).
4. **"Unrecognized format" detection** (§6.4) for wrong-bank uploads.
5. **File size/emptiness guards** on the endpoint.
6. **404 on renaming an unknown account** instead of a silent no-op.
7. **Name validation** on create.
8. **`fileName` / `rowsSeen`** added to the import response.
9. **Cards replace the `<ul>` of accounts**, since each account now carries an import surface and a result panel.

## 10. Open questions

- **Deleting an account** is not designed. It would orphan every transaction that references it; the honest options are a cascade (destroys history) or an `archived_at` flag (hides it from pickers). Same shape as the category-archival question in the Budgets doc, and worth deciding once for both.
- **Re-parsing after a fix.** If a CSV has 5 bad rows, the user fixes the spreadsheet and re-imports the whole file; the 37 good rows dedupe cleanly and only the fixed 5 land. That works today and is worth saying in the UI copy next to the parse errors: *"Fix the rows and import the same file again — everything already imported will be skipped."*
- **Column-mapping UI.** The parsers hardcode header names, and real exports vary by product. If the first real export does not match the fixtures, the fix is a one-line change in the parser — but a per-account saved column mapping would make it self-service. Explicitly deferred: it is a substantial feature and the fixtures should be corrected first.
