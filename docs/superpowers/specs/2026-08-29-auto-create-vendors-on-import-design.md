# Design — Auto-create vendors on import

**Date:** 2026-08-29
**Status:** Draft

---

## 1. Problem

Banks report merchant strings, not merchants. `resolveVendor` (exact match after
normalization) leaves most imports without a vendor, because the raw strings
carry per-transaction reference codes and store numbers:

```
AMAZON MKTPL*567RG60C1      TRADER JOE S #078
AMAZON MKTPL*9L2XN9PK3      SAFEWAY #1507
LYFT   *1 RIDE 08-02        SQ *KANTINE
```

Every unmatched string stores `vendor_id = NULL`. Rules that reference a vendor
then silently fail to match those transactions (see `docs/design/vendors.md` for
the current matching discipline).

## 2. Goal

On import, when a raw vendor string matches nothing, **create a vendor
automatically**: a cleaned display name with the raw string kept as its first
alias. Re-importing a file re-evaluates vendors on the existing rows that would
otherwise be deduped and skipped.

Explicitly out of scope:

- **Re-resolution of existing rows outside of re-import.** Already-imported rows
  stay as-is until the same file is re-imported. No new "re-run vendor
  resolution" button, no standalone pass.
- **Changing `resolveVendor` matching semantics.** It stays exact-after-
  normalization. The cleaning in this spec runs only on the *created vendor
  name*, never on the match comparison.
- **Fuzzy matching** (`SHELL OIL` vs `SHELL OIL CHANGE`). Still deferred.

## 3. Behavior

### 3.1 New rows

For each newly inserted transaction, vendor resolution becomes:

```
1. resolveVendor(rawName) matches an existing vendor name or alias  -> use it
2. else cleaned = cleanMerchantName(rawName) || rawName
   resolveVendor(cleaned) matches an existing vendor name or alias
      (e.g. vendor "Amazon" with alias "AMAZON MKTPL" absorbs
       every "AMAZON MKTPL*<ref>")                                  -> add rawName as an
                                                                       alias if new, use it
3. else createVendor(cleaned, [rawName]) and use it
```

### 3.2 Duplicate rows (re-import)

A row whose `external_id` already exists is still counted as a duplicate, but no
longer skipped silently. It runs the same resolution above and, if the resolved
vendor differs from the row's stored `vendor_id`, updates the row. The update is
deterministic — the same raw string resolves to the same vendor — so rows that
are already correct are a no-op.

### 3.3 Result reporting

`ImportResult` gains a `vendorUpdates` field: the number of existing rows whose
`vendor_id` changed during the re-evaluation pass. The import toast on the
Accounts page reports it when non-zero.

## 4. Cleaning rules (`cleanMerchantName`)

New pure function in `$lib/matchers/vendors.ts`. Given a raw string:

```
1. trim, replace '_' with a space, collapse runs of whitespace
2. strip trailing store number:            #\d+$      ("TRADER JOE S #078" -> "TRADER JOE S")
3. if the segment after the last '*' contains a digit,
   drop everything from that '*' to the end           ("AMAZON MKTPL*567RG60C1" -> "AMAZON MKTPL",
                                                        "LYFT   *1 RIDE 08-02" -> "LYFT")
   -- a word-y '*' suffix with no digit is kept       ("UBER *TRIP", "SQ *KANTINE" stay intact)
4. title-case words:                                  "TRADER JOE S" -> "Trader Joe S"
```

Worked examples on real strings:

| raw | cleaned |
|---|---|
| `TRADER JOE S #078` | `Trader Joe S` |
| `SAFEWAY #1507` | `Safeway` |
| `AMAZON MKTPL*567RG60C1` | `Amazon Mktpl` |
| `AMAZON RETA* 5N60O69A2` | `Amazon Reta` |
| `LYFT   *1 RIDE 08-02` | `Lyft` |
| `UBER   *TRIP` | `Uber *Trip` |
| `SQ *KANTINE` | `Sq *Kantine` |
| `CAPITAL ONE MOBILE PYMT` | `Capital One Mobile Pymt` |
| `IKEA SAN FRAN` | `Ikea San Fran` |

Deliberately **not** stripping a trailing "S" (possessive) — genuine merchant
names end in S ("Whole Foods"). If cleaning yields an empty string, callers fall
back to the raw string.

## 5. Implementation surface

| File | Change |
|---|---|
| `src/lib/matchers/vendors.ts` | add `cleanMerchantName(raw: string): string` |
| `src/lib/matchers/vendors.test.ts` | tests for `cleanMerchantName` |
| `src/lib/server/repos/vendors.ts` | add `resolveOrCreateVendor(conn, rawName, vendors): Promise<string>`; `addVendorAlias` returns the created alias |
| `src/lib/server/repos/vendors.test.ts` | tests for `resolveOrCreateVendor` (create / reuse-by-name / reuse-by-alias / duplicate-raw-in-one-import) |
| `src/lib/server/importCsv.ts` | use `resolveOrCreateVendor` in new-row and duplicate paths; add `vendorUpdates` to `ImportResult`; duplicate SELECT also fetches `vendor_id` |
| `src/lib/server/importCsv.test.ts` | import test: unmatched raw name now yields a vendor; re-import updates `vendor_id` and counts `vendorUpdates` |
| `src/routes/api/accounts/[id]/import/+server.ts` | no change (spreads `result`) |
| `src/routes/accounts/+page.svelte` | toast reports `vendorUpdates` when non-zero |

`resolveOrCreateVendor` takes the in-memory `vendors` array and mutates it as
vendors are created/aliased, so a single import cannot create duplicates. The
`vendors` array is loaded fresh at the start of each import.

No schema changes.

## 6. Testing

- **Pure unit tests** for `cleanMerchantName` covering the worked examples above,
  the possessive-S non-strip, and the empty-result fallback.
- **Repo tests** for `resolveOrCreateVendor` on the in-memory test DB:
  creates when nothing matches; reuses an existing vendor whose *name* equals the
  cleaned name; reuses a vendor whose *alias* equals the cleaned name (and adds
  the raw string as a new alias); two rows with the same raw name in one import
  produce one vendor.
- **Import tests**: a row with an unmatched raw name ends up with `vendor_id` set
  and a vendor created; re-importing the same rows leaves `imported` at the prior
  count, counts duplicates, updates `vendor_id`, and reports `vendorUpdates`.
- Full gate before claiming done: `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.

## 7. Error handling

Vendor creation/aliasing happens inside the existing per-row `try/catch`, so a
failure is reported in `result.errors` for that row and does not abort the rest
of the import. An auto-created vendor that fails to attach to its transaction
leaves an orphan `vendors` row (harmless; the Vendors page shows it at 0
transactions) — no transaction wrapping is introduced in this change.