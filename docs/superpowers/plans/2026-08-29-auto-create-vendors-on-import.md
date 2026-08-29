# Auto-create Vendors on Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During CSV import, unmatched raw vendor strings automatically create a vendor (cleaned display name + raw string as alias); re-importing a file re-evaluates `vendor_id` on the existing rows that would otherwise be deduped, and the import result reports how many rows were re-linked.

**Architecture:** A pure `cleanMerchantName` function derives a display name from the noisy bank string. A repo-level `resolveOrCreateVendor` resolves-or-creates a vendor per row using the in-memory vendor list (mutated as vendors/aliases are added, so one import can't create duplicates). `importTransactions` uses it in both the new-row path and the duplicate path; `ImportResult.vendorUpdates` counts re-links.

**Tech Stack:** TypeScript, SvelteKit, DuckDB (`@duckdb/node-api`), Vitest.

## Global Constraints

- Money is integer cents (`number`), never floats.
- No explanatory comments in code.
- All DB access lives under `src/lib/server/` (repos wrap CRUD); pure logic lives in `$lib` and is unit-tested.
- Server tests run under the `node` environment via `createTestDb()` from `src/lib/server/test-helpers.ts`.
- Required verification before claiming completion: `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.
- Follow TDD: write the failing test, watch it fail, then implement.

---

### Task 1: `cleanMerchantName` pure function + unit tests

**Files:**
- Modify: `src/lib/matchers/vendors.ts`
- Test: `src/lib/matchers/vendors.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `export function cleanMerchantName(raw: string): string` — returns the cleaned display name, or `''` if nothing remains after stripping.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/matchers/vendors.test.ts`:

```ts
describe('cleanMerchantName', () => {
	it('strips trailing store numbers', () => {
		expect(cleanMerchantName('TRADER JOE S #078')).toBe('Trader Joe S');
		expect(cleanMerchantName('SAFEWAY #1507')).toBe('Safeway');
	});
	it('strips trailing ref codes that contain a digit', () => {
		expect(cleanMerchantName('AMAZON MKTPL*567RG60C1')).toBe('Amazon Mktpl');
		expect(cleanMerchantName('AMAZON RETA* 5N60O69A2')).toBe('Amazon Reta');
		expect(cleanMerchantName('LYFT   *1 RIDE 08-02')).toBe('Lyft');
	});
	it('keeps word-y star suffixes intact', () => {
		expect(cleanMerchantName('UBER   *TRIP')).toBe('Uber *Trip');
		expect(cleanMerchantName('SQ *KANTINE')).toBe('Sq *Kantine');
	});
	it('title-cases plain names and normalizes whitespace and underscores', () => {
		expect(cleanMerchantName('CAPITAL ONE MOBILE PYMT')).toBe('Capital One Mobile Pymt');
		expect(cleanMerchantName('IKEA SAN FRAN')).toBe('Ikea San Fran');
		expect(cleanMerchantName('Vagaro_*Hair By Eva')).toBe('Vagaro *Hair By Eva');
	});
	it('does not strip a trailing possessive S', () => {
		expect(cleanMerchantName('WHOLE FOODS')).toBe('Whole Foods');
	});
	it('returns empty string when only a store number remains', () => {
		expect(cleanMerchantName('#078')).toBe('');
	});
});
```

Update the import on line 2 to include `cleanMerchantName`:

```ts
import { resolveVendor, cleanMerchantName, type VendorSpec } from './vendors';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/matchers/vendors.test.ts`
Expected: FAIL — `cleanMerchantName is not a function`.

- [ ] **Step 3: Implement `cleanMerchantName`**

Add to `src/lib/matchers/vendors.ts`:

```ts
export function cleanMerchantName(raw: string): string {
	let s = raw.trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
	s = s.replace(/\s*#\d+$/, '');
	const starIdx = s.lastIndexOf('*');
	if (starIdx >= 0 && /\d/.test(s.slice(starIdx + 1))) {
		s = s.slice(0, starIdx).trimEnd();
	}
	return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/matchers/vendors.test.ts`
Expected: PASS (all `resolveVendor` tests still pass too).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchers/vendors.ts src/lib/matchers/vendors.test.ts
git commit -m "feat: add cleanMerchantName for auto-created vendor names"
```

---

### Task 2: `resolveOrCreateVendor` repo function + tests

**Files:**
- Modify: `src/lib/server/repos/vendors.ts`
- Test: `src/lib/server/repos/vendors.test.ts`

**Interfaces:**
- Consumes: `cleanMerchantName` and `resolveVendor` from `$lib/matchers/vendors` (Task 1); existing `createVendor(conn, name, aliases): Promise<Vendor>` and `listVendors(conn): Promise<Vendor[]>` in this file.
- Produces:
  - `export async function resolveOrCreateVendor(conn: DuckDBConnection, rawName: string, vendors: Vendor[]): Promise<string>` — returns a vendor id; mutates `vendors` (pushes a created vendor, or appends a new alias to an existing one).
  - `addVendorAlias(conn, vendorId, name)` now returns `Promise<VendorAlias>` instead of `Promise<void>`.
  - `Vendor` type: `{ id: string; name: string; aliases: VendorAlias[] }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/server/repos/vendors.test.ts`. Update its imports to include `resolveOrCreateVendor` (and `listVendors`, `createVendor` if not already imported):

```ts
import { listVendors, createVendor, addVendorAlias, resolveOrCreateVendor } from './vendors';

describe('resolveOrCreateVendor', () => {
	it('creates a vendor when nothing matches, keeping the raw string as the first alias', async () => {
		const conn = await createTestDb();
		const vendors = await listVendors(conn);
		const id = await resolveOrCreateVendor(conn, 'TRADER JOE S #078', vendors);
		expect(id).toBeTruthy();
		const all = await listVendors(conn);
		expect(all).toHaveLength(1);
		expect(all[0].name).toBe('Trader Joe S');
		expect(all[0].aliases.map((a) => a.name)).toEqual(['TRADER JOE S #078']);
	});

	it('reuses a vendor whose name matches the cleaned name and adds the raw alias', async () => {
		const conn = await createTestDb();
		const existing = await createVendor(conn, 'Trader Joe S');
		const vendors = await listVendors(conn);
		const id = await resolveOrCreateVendor(conn, 'TRADER JOE S #225', vendors);
		expect(id).toBe(existing.id);
		const all = await listVendors(conn);
		expect(all).toHaveLength(1);
		expect(all[0].aliases.map((a) => a.name)).toEqual(['TRADER JOE S #225']);
	});

	it('reuses a vendor whose alias matches the cleaned name and adds the raw alias', async () => {
		const conn = await createTestDb();
		const amazon = await createVendor(conn, 'Amazon', ['AMAZON MKTPL']);
		const vendors = await listVendors(conn);
		const id = await resolveOrCreateVendor(conn, 'AMAZON MKTPL*567RG60C1', vendors);
		expect(id).toBe(amazon.id);
		const all = await listVendors(conn);
		expect(all).toHaveLength(1);
		expect(all[0].aliases.map((a) => a.name)).toEqual(['AMAZON MKTPL', 'AMAZON MKTPL*567RG60C1']);
	});

	it('returns an existing vendor untouched when the raw string matches exactly', async () => {
		const conn = await createTestDb();
		const amazon = await createVendor(conn, 'Amazon', ['AMZN MKTP US']);
		const vendors = await listVendors(conn);
		expect(await resolveOrCreateVendor(conn, 'AMZN MKTP US', vendors)).toBe(amazon.id);
		const all = await listVendors(conn);
		expect(all).toHaveLength(1);
		expect(all[0].aliases).toHaveLength(1);
	});

	it('creates one vendor for repeated raw names in a single import', async () => {
		const conn = await createTestDb();
		const vendors = await listVendors(conn);
		const a = await resolveOrCreateVendor(conn, 'SAFEWAY #1507', vendors);
		const b = await resolveOrCreateVendor(conn, 'SAFEWAY #1507', vendors);
		expect(a).toBe(b);
		expect(await listVendors(conn)).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/repos/vendors.test.ts`
Expected: FAIL — `resolveOrCreateVendor is not a function`.

- [ ] **Step 3: Implement the changes in `src/lib/server/repos/vendors.ts`**

Add the matcher import at the top of the file:

```ts
import { resolveVendor, cleanMerchantName, type VendorSpec } from '$lib/matchers/vendors';
```

Change `addVendorAlias` to return the created alias (generate the id in the repo so the returned value matches the DB row):

```ts
export async function addVendorAlias(
	conn: DuckDBConnection,
	vendorId: string,
	name: string
): Promise<VendorAlias> {
	const id = randomUUID();
	await conn.run(
		'INSERT INTO vendor_aliases (id, vendor_id, name, created_at) VALUES (?, ?, ?, ?)',
		[id, vendorId, name, new Date().toISOString()]
	);
	return { id, name };
}
```

Add `resolveOrCreateVendor` at the end of the file:

```ts
export async function resolveOrCreateVendor(
	conn: DuckDBConnection,
	rawName: string,
	vendors: Vendor[]
): Promise<string> {
	const specs: VendorSpec[] = vendors.map((v) => ({
		id: v.id,
		name: v.name,
		aliases: v.aliases.map((a) => a.name),
	}));
	const direct = resolveVendor(rawName, specs);
	if (direct) return direct;
	const cleaned = cleanMerchantName(rawName) || rawName;
	const viaCleaned = resolveVendor(cleaned, specs);
	if (viaCleaned) {
		const vendor = vendors.find((v) => v.id === viaCleaned)!;
		if (!vendor.aliases.some((a) => a.name === rawName)) {
			const alias = await addVendorAlias(conn, viaCleaned, rawName);
			vendor.aliases.push(alias);
		}
		return viaCleaned;
	}
	const created = await createVendor(conn, cleaned, [rawName]);
	vendors.push(created);
	return created.id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/repos/vendors.test.ts`
Expected: PASS (all existing merge/delete tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/repos/vendors.ts src/lib/server/repos/vendors.test.ts
git commit -m "feat: add resolveOrCreateVendor for auto-creating vendors on import"
```

---

### Task 3: Integrate into `importTransactions` (new rows, duplicate re-evaluation, `vendorUpdates`)

**Files:**
- Modify: `src/lib/server/importCsv.ts`
- Modify: `src/lib/server/importCsv.test.ts`
- Modify: `scripts/import.ts`

**Interfaces:**
- Consumes: `resolveOrCreateVendor(conn, rawName, vendors: Vendor[])` and `listVendors(conn): Promise<Vendor[]>` (Task 2).
- Produces: `ImportResult` gains `vendorUpdates: number`. `importTransactions(conn, accountId, rows)` now (a) auto-creates vendors for new rows, (b) re-evaluates `vendor_id` on duplicate rows and updates it when it differs, (c) counts those updates in `vendorUpdates`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/server/importCsv.test.ts`. Update its import of `./repos/vendors` to include `listVendors`:

```ts
import { createVendor, listVendors } from './repos/vendors';
```

Add inside the `describe('importTransactions', ...)` block:

```ts
it('auto-creates vendors for unmatched raw names', async () => {
	const conn = await createTestDb();
	const account = await createAccount(conn, {
		name: 'CapOne',
		bank: 'capital_one',
		type: 'credit',
	});
	const result = await importTransactions(conn, account.id, [
		{
			postedDate: '2026-07-01',
			description: 'TRADER JOE S #078',
			rawVendorName: 'TRADER JOE S #078',
			amountCents: -1234,
		},
	]);
	expect(result.imported).toBe(1);
	expect(result.vendorUpdates).toBe(0);
	const txs = await listTransactions(conn, {});
	expect(txs[0].vendorId).not.toBeNull();
	const vendors = await listVendors(conn);
	expect(vendors).toHaveLength(1);
	expect(vendors[0].name).toBe('Trader Joe S');
	expect(vendors[0].aliases.map((a) => a.name)).toEqual(['TRADER JOE S #078']);
});

it('re-evaluates vendor_id on duplicate rows and counts vendorUpdates', async () => {
	const conn = await createTestDb();
	const account = await createAccount(conn, {
		name: 'CapOne',
		bank: 'capital_one',
		type: 'credit',
	});
	const rows: ParsedRow[] = [
		{
			postedDate: '2026-07-01',
			description: 'TRADER JOE S #078',
			rawVendorName: 'TRADER JOE S #078',
			amountCents: -1234,
		},
	];
	await importTransactions(conn, account.id, rows);
	await conn.run('UPDATE account_transactions SET vendor_id = NULL');
	const result = await importTransactions(conn, account.id, rows);
	expect(result.imported).toBe(0);
	expect(result.duplicates).toBe(1);
	expect(result.vendorUpdates).toBe(1);
	const txs = await listTransactions(conn, {});
	expect(txs[0].vendorId).not.toBeNull();
});

it('absorbs variants into an existing vendor by cleaned name alias', async () => {
	const conn = await createTestDb();
	const account = await createAccount(conn, {
		name: 'CapOne',
		bank: 'capital_one',
		type: 'credit',
	});
	const amazon = await createVendor(conn, 'Amazon', ['AMAZON MKTPL']);
	await importTransactions(conn, account.id, [
		{
			postedDate: '2026-07-02',
			description: 'AMAZON MKTPL*567RG60C1',
			rawVendorName: 'AMAZON MKTPL*567RG60C1',
			amountCents: -4567,
		},
	]);
	const txs = await listTransactions(conn, {});
	expect(txs[0].vendorId).toBe(amazon.id);
	const vendors = await listVendors(conn);
	expect(vendors).toHaveLength(1);
	expect(vendors[0].aliases.map((a) => a.name)).toEqual(['AMAZON MKTPL', 'AMAZON MKTPL*567RG60C1']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/importCsv.test.ts`
Expected: The first new test FAILS — `vendorUpdates` is `undefined`, and the auto-created-vendor assertions fail because `SHELL OIL`-style unmatched names still insert `vendor_id = NULL`.

- [ ] **Step 3: Implement the `importCsv.ts` changes**

Change the imports at the top of `src/lib/server/importCsv.ts`. Remove the matcher import and extend the existing `./repos/vendors` import (do NOT import `listVendors` twice):

```ts
import { resolveVendor } from '$lib/matchers/vendors';
```

becomes (deleted line), and

```ts
import { listVendors } from './repos/vendors';
```

becomes

```ts
import { listVendors, resolveOrCreateVendor } from './repos/vendors';
```

Update `ImportResult` to add the field:

```ts
export interface ImportResult {
	imported: number;
	duplicates: number;
	errors: string[];
	categorized: number;
	vendorUpdates: number;
}
```

Change the vendor loading (currently maps to a simplified shape) to use the repo type directly, and initialize the new counter:

```ts
	const result: ImportResult = {
		imported: 0,
		duplicates: 0,
		errors: [],
		categorized: 0,
		vendorUpdates: 0,
	};
	const vendors = await listVendors(conn);
```

Replace the duplicate-detection block so it also fetches `vendor_id` and re-evaluates it:

```ts
		const exists = await conn.runAndReadAll(
			'SELECT id, vendor_id FROM account_transactions WHERE external_id = ?',
			[id]
		);
		if (exists.getRowObjects().length > 0) {
			result.duplicates++;
			try {
				const existing = exists.getRowObjects()[0];
				const resolved = await resolveOrCreateVendor(conn, row.rawVendorName, vendors);
				const current = existing.vendor_id === null ? null : String(existing.vendor_id);
				if (resolved !== current) {
					await conn.run('UPDATE account_transactions SET vendor_id = ? WHERE id = ?', [
						resolved,
						String(existing.id),
					]);
					result.vendorUpdates++;
				}
			} catch (err) {
				result.errors.push(
					`Duplicate "${row.description}" (${row.postedDate}): ${(err as Error).message}`
				);
			}
			continue;
		}
```

Replace the new-row vendor resolution line:

```ts
			const vendorId = resolveVendor(row.rawVendorName, vendors);
```

becomes

```ts
			const vendorId = await resolveOrCreateVendor(conn, row.rawVendorName, vendors);
```

Update `scripts/import.ts` to report the new count (line 24-26):

```ts
console.log(
	`Imported ${result.imported}, duplicates ${result.duplicates}, categorized ${result.categorized}, re-linked ${result.vendorUpdates}, parse errors ${parsed.errors.length}`
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/importCsv.test.ts`
Expected: PASS (all new and existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/importCsv.ts src/lib/server/importCsv.test.ts scripts/import.ts
git commit -m "feat: auto-create vendors on import and re-evaluate on re-import"
```

---

### Task 4: Report `vendorUpdates` in the Accounts import toast

**Files:**
- Modify: `src/routes/accounts/+page.svelte` (the `importCsv` function, around lines 37-41)

**Interfaces:**
- Consumes: `ImportResult.vendorUpdates` (Task 3).

- [ ] **Step 1: Make the change**

Replace the toast in `importCsv` (lines 37-41):

```svelte
			const result = await res.json();
			toastStore.add(
				'ok',
				`Imported ${result.imported}, skipped ${result.duplicates} duplicate(s)`
			);
```

with:

```svelte
			const result = await res.json();
			const parts = [`Imported ${result.imported}, skipped ${result.duplicates} duplicate(s)`];
			if (result.vendorUpdates > 0) parts.push(`${result.vendorUpdates} re-linked to vendor(s)`);
			toastStore.add('ok', parts.join(' · '));
```

- [ ] **Step 2: Type-check and build**

Run: `npm run check && npm run build`
Expected: PASS with no new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add src/routes/accounts/+page.svelte
git commit -m "feat: report vendor re-links in the import toast"
```

---

### Task 5: Full verification gate

**Files:** none.

- [ ] **Step 1: Run the full gate**

Run: `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`
Expected: All pass, formatting clean, 90+ tests pass.

- [ ] **Step 2: Manual smoke test against the running app**

With the dev server up and a throwaway DB (see AGENTS.md "End-to-end verification"), import `src/lib/parsers/fixtures/capitalOne-sample.csv` into a fresh account and confirm:
- Every imported row now has a non-null vendor (Transactions page shows a vendor name).
- Re-importing the same file reports `Imported 0, skipped N duplicate(s)` plus `N re-linked to vendor(s)`.
- The `TRADER JOE S #078` rows resolve to a `Trader Joe S` vendor.

Stop the dev server afterwards: `pkill -f "vite dev"`.