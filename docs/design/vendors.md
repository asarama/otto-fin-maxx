# Design Doc — Vendors (`/vendors`)

**Date:** 2026-08-01
**Status:** Draft
**Plan source:** Task 14 — "Vendors page"
**Depends on:** [`shared-components.md`](./shared-components.md)

---

## 1. Purpose

Banks do not report merchant names; they report strings. `AMZN MKTP US*2H4KL9`, `AMZN Mktp US`, `Amazon.com*RT4G1`. This page is where those strings get collapsed into one merchant a human recognizes.

Three jobs:

1. **Create a vendor** with the aliases it appears as.
2. **Add an alias** to an existing vendor when a new string shows up.
3. **Merge** two vendors that turn out to be the same merchant.

The payoff is elsewhere: resolved vendors make Rules precise (match on vendor rather than a regex), make the Transactions list readable, and make the Review queue groupable.

**The design problem:** the plan's version is a list of vendors and three forms. It gives no answer to the only question that actually drives work on this page — *"which unmatched strings should I turn into aliases?"* Without that, a user has to notice a bad vendor on the Transactions page, come here, and retype the string from memory. This design surfaces the unmatched strings directly.

---

## 2. Files

| File | Status | Role |
|---|---|---|
| `src/routes/vendors/+page.server.ts` | plan | Load vendors (+ usage counts + unmatched strings) |
| `src/routes/vendors/+page.svelte` | plan | Page |
| `src/routes/api/vendors/+server.ts` | plan | `POST` create |
| `src/routes/api/vendors/[id]/aliases/+server.ts` | plan | `POST` add alias |
| `src/routes/api/vendors/[id]/aliases/[aliasId]/+server.ts` | **new** | `DELETE` remove alias |
| `src/routes/api/vendors/merge/+server.ts` | plan | `POST` merge |
| `src/routes/api/vendors/[id]/+server.ts` | **new** | `PATCH` rename |

---

## 3. Layout

```
   Vendors                                                    [+ New vendor]
   Collapse the strings your banks report into merchants you recognize
   ─────────────────────────────────────────────────────────────────────────

   ┌ Unmatched merchant strings ─────────────────── 9 strings · 34 txns ──┐
   │  These appear in your transactions but aren't linked to a vendor.    │
   │                                                                      │
   │   SQ *BLUE BOTTLE COFFEE        12 txns   [+ New vendor] [Link to ▾] │
   │   WM SUPERCENTER #1234           8 txns   [+ New vendor] [Link to ▾] │
   │   TST* HOPDODDY 411              5 txns   [+ New vendor] [Link to ▾] │
   │                                                    [show 6 more]     │
   └──────────────────────────────────────────────────────────────────────┘

   🔍 [filter vendors…]                                    12 vendors

   ┌──────────────────────────────────────────────────────────────────────┐
   │  Amazon                                        118 txns    ✎  ⇄      │
   │    AMZN MKTP US ✕    AMAZON.COM ✕    AMZN Mktp US ✕                  │
   │    [+ add alias]                                                     │
   ├──────────────────────────────────────────────────────────────────────┤
   │  Shell                                          22 txns    ✎  ⇄      │
   │    SHELL OIL ✕                                                       │
   │    [+ add alias]                                                     │
   ├──────────────────────────────────────────────────────────────────────┤
   │  Uber                                            0 txns    ✎  ⇄      │
   │    no aliases yet — this vendor will never match automatically       │
   │    [+ add alias]                                                     │
   └──────────────────────────────────────────────────────────────────────┘
```

### Region specs

**Header** — `<PageHeader title="Vendors" subtitle="Collapse the strings your banks report into merchants you recognize">` with a primary `[+ New vendor]`.

**Unmatched strings panel** — the most important region and the one the plan does not have. A `<Card tone="well">` listing distinct `raw_vendor_name` values from transactions where `vendor_id IS NULL`, ordered by transaction count descending, top 8 with a "show N more" disclosure.

Each row: the raw string in `--font-mono` (it is machine output — set it as such), the count, and two actions:

- **`[+ New vendor]`** — opens the create form pre-filled with the string as the *first alias* and a cleaned-up guess as the *name* (`SQ *BLUE BOTTLE COFFEE` → `Blue Bottle Coffee`, via `titleCaseMerchant`, always editable).
- **`[Link to ▾]`** — a searchable vendor picker; choosing one adds the string as an alias of that vendor.

Either action re-resolves matching transactions (§5.3). The panel's header shows the total: *"9 strings · 34 transactions"* — a running score for how much unresolved noise is left.

**Filter** — a `TextInput` filtering the vendor list client-side on name and aliases. No round-trip; the vendor count is small.

**Vendor list** — a `<Card>` containing one row per vendor separated by `--space-3` of whitespace (no rules — the mockup has none) (a list, not a `<DataTable>` — each row is variable-height because of the alias chips):

| Element | Treatment |
|---|---|
| Name | `--text-primary` 500 `--text-md`; inline-editable via `✎` |
| Transaction count | `--text-secondary`, tabular, right-aligned |
| `✎` | Rename vendor |
| `⇄` | Merge this vendor into another |
| Alias chips | `--surface-secondary` pills, `--font-mono` `--text-xs`, each with a `✕` remove button |
| `[+ add alias]` | Ghost button → inline `TextInput` scoped **to that row** |

A vendor with no aliases gets the muted warning line *"no aliases yet — this vendor will never match automatically"*. That state is easy to create (the plan's `createVendor` allows empty aliases) and completely silent otherwise: the vendor name itself is matched, so it only resolves when the bank's string happens to equal the display name exactly.

**Merge flow** — `⇄` opens `<ConfirmDialog>`:

```
  ┌ Merge vendor ───────────────────────────────────────────┐
  │  Merge  Amazon Prime  into  [ Amazon ▾ ]                │
  │                                                         │
  │  Amazon will keep its name and gain:                    │
  │    · 2 aliases   PRIME VIDEO, AMZN DIGITAL              │
  │    · 14 transactions                                    │
  │    · 1 rule reference                                   │
  │                                                         │
  │  Amazon Prime will be deleted. This can't be undone.    │
  │                        [Cancel]  [Merge vendors]        │
  └─────────────────────────────────────────────────────────┘
```

The dialog states exactly what moves and what disappears, because `mergeVendors` is the one irreversible operation in the app. The target picker excludes the source vendor, so `keepId === removeId` is unreachable — the plan's two free dropdowns allow it, and merging a vendor into itself runs `DELETE FROM vendors WHERE id = keepId` at the end, deleting the vendor the user meant to keep.

---

## 4. Shared components used

| Component | Where |
|---|---|
| `PageHeader` | Title + new vendor |
| `Card` | Unmatched panel, vendor list |
| `Field`, `TextInput`, `SelectInput` | Create, rename, alias, merge target |
| `Button`, `IconButton` | All actions |
| `ConfirmDialog` / `Modal` | Merge |
| `InlineBanner` | "No aliases" warning, merge results |
| `EmptyState` | No vendors |
| `Toast` | Every mutation |

---

## 5. Data model interactions

### 5.1 Reads

```ts
listVendors(conn)   // vendors LEFT JOIN vendor_aliases, grouped into { id, name, aliases[] }
```

Plus two queries this design adds:

```sql
-- usage counts per vendor
SELECT vendor_id, COUNT(*) AS n
FROM account_transactions
WHERE vendor_id IS NOT NULL
GROUP BY vendor_id;

-- unmatched raw strings
SELECT raw_vendor_name, COUNT(*) AS n
FROM account_transactions
WHERE vendor_id IS NULL AND raw_vendor_name IS NOT NULL
GROUP BY raw_vendor_name
ORDER BY n DESC;
```

Coerce both counts with `Number(...)`.

### 5.2 Writes

| Action | Repo call | Tables |
|---|---|---|
| Create vendor | `createVendor(name, aliases[])` | insert `vendors`, insert `vendor_aliases` |
| Add alias | `addVendorAlias(vendorId, name)` | insert `vendor_aliases` |
| Remove alias | `removeVendorAlias(aliasId)` *(new)* | delete `vendor_aliases` |
| Rename vendor | `renameVendor(id, name)` *(new)* | update `vendors.name` |
| Merge | `mergeVendors(keepId, removeId)` | delete/update `rule_vendors`, update `vendor_aliases`, update `account_transactions`, delete duplicate aliases, delete `vendors` |

### 5.3 Re-resolution after an alias change — the missing write

Adding an alias should retroactively resolve the transactions that alias matches. Nothing in the plan does this. Vendor resolution happens **only during import** (`importTransactions` calls `resolveVendor` per row), so after adding `AMZN MKTP US` to Amazon, the 47 existing transactions with that raw string keep `vendor_id = NULL` until they are re-imported — which never happens, because they dedupe.

**Amendment:** add to `$lib/server/repos/vendors.ts`:

```ts
resolveUnmatchedTransactions(conn, vendorId?: string): Promise<number>
```

It loads vendors (or the one vendor), then for every `account_transactions` row with `vendor_id IS NULL` runs the same pure `resolveVendor(rawVendorName, vendors)` used at import and writes the matches. Returns the number of rows updated.

Called after: create vendor (with aliases), add alias, and the unmatched-panel actions. The toast reports it: *"Alias added · 47 transactions now linked to Amazon."* That single number is what makes the page feel like it did something.

It touches only `vendor_id IS NULL` rows, so it can never re-point a transaction that already resolved — matching the "never overwrite an existing assignment" discipline the rules engine follows.

Whether it should also run after *removing* an alias: no. Removal leaves existing `vendor_id` values in place. Un-resolving would silently rewrite history for a fat-fingered `✕`. The confirm copy says so: *"Removing an alias won't change transactions that already matched it."*

### 5.4 Merge, precisely

`mergeVendors(keepId, removeId)` in the plan, in order:

1. `DELETE FROM rule_vendors WHERE vendor_id = removeId AND rule_id IN (SELECT rule_id FROM rule_vendors WHERE vendor_id = keepId)` — drops rows that would violate the `(rule_id, vendor_id)` primary key after the update.
2. `UPDATE vendor_aliases SET vendor_id = keepId WHERE vendor_id = removeId`
3. `UPDATE account_transactions SET vendor_id = keepId WHERE vendor_id = removeId`
4. `UPDATE rule_vendors SET vendor_id = keepId WHERE vendor_id = removeId`
5. Delete case-insensitively duplicated aliases within the surviving vendor
6. `DELETE FROM vendors WHERE id = removeId`

Two design consequences:

- **The removed vendor's name is lost, not kept as an alias.** If the bank ever reports the literal string "Amazon Prime", it will no longer resolve. The dialog should therefore offer a checkbox, checked by default: **"Keep 'Amazon Prime' as an alias"** — a one-line `addVendorAlias(keepId, removedName)` before the merge that prevents a silent regression in match coverage.
- **Rule references survive.** A rule that targeted the removed vendor now targets the kept one. The dialog names the count ("1 rule reference") so that is a decision, not a surprise.

Wrap all steps in a single `BEGIN`/`COMMIT`. A merge that fails halfway leaves aliases pointing at a vendor row that step 6 already deleted.

### 5.5 Tables touched

| Table | Access |
|---|---|
| `vendors` | read, insert, update (name), delete (merge) |
| `vendor_aliases` | read, insert, update (merge), delete |
| `account_transactions` | read (counts, unmatched strings), update (`vendor_id` on merge and re-resolution) |
| `rule_vendors` | read (merge preview count), update/delete (merge) |

### 5.6 Matching semantics worth surfacing

`resolveVendor` is **exact match after normalization** — trim, collapse internal whitespace, lowercase. It is not fuzzy and not a prefix match. So `AMZN MKTP US*2H4KL9` does **not** match the alias `AMZN MKTP US`.

This is the single biggest thing a user needs to understand on this page, because bank strings routinely carry per-transaction reference codes. The unmatched panel is the mitigation: rather than explaining the rule, it shows exactly which strings failed and offers one click to alias them. The panel's description line says it plainly: *"Aliases must match the whole string exactly."*

If unmatched strings turn out to be dominated by trailing reference codes, the right fix is a normalization step in `resolveVendor` (strip trailing `*XXXX` / `#1234` / digit runs) — a change to a pure, already-tested function. That is a data question, answerable after the first real import, so it is not being pre-solved here.

---

## 6. API routes

### 6.1 `POST /api/vendors`
**Request** `{ "name": "Amazon", "aliases": ["AMZN MKTP US"] }`
**Response** `200 { vendor, resolved: 47 }` — `resolved` from `resolveUnmatchedTransactions`.

| Status | When |
|---|---|
| 400 | Empty name |
| 409 | A vendor with that name already exists (case-insensitive) |
| 409 | One of the aliases already belongs to another vendor — `Alias "AMZN MKTP US" already belongs to Amazon` |

Both 409s are new. Duplicate vendor names make every picker ambiguous, and a duplicate alias makes resolution order-dependent (`resolveVendor` returns the first match in list order — silently, whichever vendor happens to sort first).

### 6.2 `PATCH /api/vendors/[id]` *(new)*
**Request** `{ "name": "Amazon.com" }` → **Response** `200 { ok: true }`. 400 on empty, 404 unknown, 409 duplicate.

### 6.3 `POST /api/vendors/[id]/aliases`
**Request** `{ "name": "AMZN MKTP US" }`
**Response** `200 { ok: true, aliasId, resolved: 47 }`

| Status | When |
|---|---|
| 400 | Empty alias |
| 404 | Unknown vendor |
| 409 | Alias already exists on this or another vendor |

### 6.4 `DELETE /api/vendors/[id]/aliases/[aliasId]` *(new)*
**Response** `200 { ok: true }`. 404 if the alias does not belong to that vendor.

### 6.5 `POST /api/vendors/merge`
**Request** `{ "keepId": "uuid", "removeId": "uuid", "keepRemovedNameAsAlias": true }`
**Response** `200 { ok: true, movedTransactions: 14, movedAliases: 2, movedRules: 1 }`

| Status | When |
|---|---|
| 400 | `keepId === removeId` — `Cannot merge a vendor into itself` |
| 404 | Either id unknown |

The response counts feed the success toast and are gathered before the merge inside the same transaction.

### 6.6 `GET /api/vendors/merge/preview?keepId=&removeId=` *(new)*
Returns the counts the dialog displays before committing: `{ aliases, transactions, rules }`.

---

## 7. States

| State | Treatment |
|---|---|
| **No vendors** | `<EmptyState title="No vendors yet" body="Vendors let you name the merchants behind your bank's raw strings. Import some transactions first, then create vendors from what shows up.">` — plus the unmatched panel, which is where the work actually is. |
| **No unmatched strings** | The panel collapses to a single sage line: *"Every transaction is linked to a vendor."* |
| **No transactions at all** | Unmatched panel hidden; a `tone="info"` banner points at Accounts. |
| **Vendor with 0 aliases** | Muted warning line in the row (§3). |
| **Vendor with 0 transactions** | Count renders `0` in `--text-secondary`; no warning — a newly created vendor is legitimately unused. |
| **Saving** | The specific control goes `busy`; the row dims. Alias chips animate in (`--motion-fast` scale from 0.9). |
| **Conflict (409)** | Inline `<Field error>` on the offending input, naming the owner: *"AMZN MKTP US already belongs to Amazon."* Not a toast — the fix is in the field. |
| **Merging** | Dialog button `busy`; on success the removed row collapses (`--motion-mid`) and the kept row flashes with its new alias chips. |

---

## 8. Interactions & accessibility

- **Per-row state is per-row.** Each vendor row owns its own alias draft. The plan binds one `newAlias` variable to every row's input simultaneously, so typing in row 3 fills every row's box and "Add alias" on row 7 submits row 3's text. Fixed by keying editing state to the vendor id (`aliasDraftFor`, `aliasDraft`) with only one row editable at a time.
- **Alias chips** are `<span>` + a real `<button aria-label="Remove alias AMZN MKTP US">`. Removal is immediate (no confirm) because it is reversible by re-adding — but the toast includes an `[Undo]` that re-posts the alias.
- **Keyboard:** `Enter` in the alias input submits and keeps the input open for the next alias (aliases come in batches); `Esc` closes it.
- **Merge dialog** is a native `<dialog>`: focus trap, `Esc`, backdrop inert. Focus starts on the target picker; the confirm button is `tone="danger"`.
- **Raw strings are `--font-mono`** everywhere so `l`/`1`/`I` and `0`/`O` are distinguishable — these get compared character by character.
- **Filter input** is `type="search"` with `aria-controls` pointing at the list and a polite live count ("12 of 34 vendors").
- **Headings:** `h1` page, `h2` "Unmatched merchant strings", `h2` "Vendors".

---

## 9. Deviations from the plan (Task 14)

1. **Unmatched-strings panel added** — the plan gives no way to discover what needs aliasing.
2. **Per-row alias state fixed** (§8) — the plan's shared `newAlias` binding is a functional defect.
3. **`resolveUnmatchedTransactions` added** — without it, aliases only affect future imports, which for a deduped CSV means they never take effect on existing data. This is the most consequential gap in the task.
4. **Merge is a confirmed dialog with a preview**, and `keepId === removeId` is unreachable (the plan's two free selects both default to `''` and allow the same value in both).
5. **"Keep removed name as an alias"** option on merge.
6. **Alias removal and vendor rename added** (`DELETE …/aliases/[aliasId]`, `PATCH /api/vendors/[id]`).
7. **409s on duplicate vendor names and duplicate aliases.**
8. **Usage counts** per vendor.
9. **Merge wrapped in a DB transaction.**

## 10. Open questions

- **Fuzzy matching.** `resolveVendor` is exact-after-normalization. Prefix or token-set matching would collapse most reference-code noise automatically, at the cost of false positives (`SHELL OIL` vs `SHELL OIL CHANGE`). Decision deferred until real import data shows how bad the tail actually is; the unmatched panel is the instrument that measures it.
- **Auto-suggest vendors from unmatched strings.** Clustering the unmatched list by common prefix would let one click create "Blue Bottle" from five variants at once. Natural follow-up to the panel; not v1.
- **Deleting a vendor** (as opposed to merging) is not designed — same referential-integrity shape as deleting categories and accounts. Merging covers the real use case.
