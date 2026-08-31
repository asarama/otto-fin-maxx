# Admin Tab: Full Reset + Owner Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Admin tab that can reset all data (truncate every table) and create owners, and stop auto-seeding defaults on startup.

**Architecture:** A new `src/lib/server/repos/admin.ts` exposes `truncateAll()` (DELETE every table in FK order, one transaction) and `tableCounts()`. `getDb()` stops calling `seedDefaults`. The Admin page (`/admin`) loads per-table counts + owners via a new `adminData()` loader; `POST /api/admin/reset` and `POST /api/owners` back the two actions. `sample-data.ts` learns to create owners so it still works on an empty DB.

**Tech Stack:** SvelteKit (Svelte 5 runes), DuckDB via `@duckdb/node-api`, Vitest, TypeScript.

## Global Constraints

- No schema changes; tables are truncated in place.
- Money remains integer cents (`number`); not relevant to this change.
- No explanatory comments in code.
- Svelte 5 runes throughout; every `{#each}` needs a key (`(item.id)`).
- Nav link arrays use `as const` (existing pattern in `NavRail.svelte`).
- Full gate before claiming done: `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.
- `seedDefaults` must keep existing in `src/lib/server/seed.ts` (used by `createTestDb()` and `db.test.ts`).
- No owner edit/delete UI — only creation.

---

### Task 1: `truncateAll` repo function + tests

**Files:**
- Create: `src/lib/server/repos/admin.ts`
- Test: `src/lib/server/repos/admin.test.ts`

**Interfaces:**
- Produces: `tableCounts(conn: DuckDBConnection): Promise<TableCount[]>` and `truncateAll(conn: DuckDBConnection): Promise<TableCount[]>` where `TableCount = { table: string; count: number }`. Delete order (children first): `account_transactions`, `rule_vendors`, `vendor_aliases`, `budget_category_months`, `rules`, `budget_categories`, `accounts`, `vendors`, `budgets`, `owners`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/repos/admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { truncateAll, tableCounts } from './admin';
import { createAccount } from './accounts';
import { createBudget, createBudgetCategory, listOwners } from './budgets';
import { createVendor } from './vendors';

describe('admin repo', () => {
	it('truncates every table and reports zero counts', async () => {
		const conn = await createTestDb();
		const acct = await createAccount(conn, { name: 'BMO', bank: 'bmo', type: 'debit' });
		const vendor = await createVendor(conn, 'Shell');
		const owner = (await listOwners(conn))[0];
		const budget = await createBudget(conn, { ownerId: owner.id, name: 'Household' });
		const cat = await createBudgetCategory(conn, {
			budgetId: budget.id,
			name: 'Groceries',
			monthlyLimitCents: 60000,
		});
		await conn.run(
			`INSERT INTO budget_category_months (id, budget_category_id, month, amount_cents)
       VALUES ('m1', ?, '2026-08', 60000)`,
			[cat.id]
		);
		await conn.run(
			`INSERT INTO account_transactions
       (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
       VALUES ('t1', ?, 'e1', '2026-08-01', 'SHELL OIL', 'SHELL OIL', -3890, ?, 'unreviewed', '2026-08-01')`,
			[acct.id, vendor.id]
		);
		await conn.run(
			`INSERT INTO rules (id, name, description_matcher, amount_operator, budget_category_id, priority)
       VALUES ('r1', 'Shell', 'SHELL', 'any', ?, 1)`,
			[cat.id]
		);
		await conn.run(`INSERT INTO rule_vendors (rule_id, vendor_id) VALUES ('r1', ?)`, [vendor.id]);
		await conn.run(
			`INSERT INTO vendor_aliases (id, vendor_id, name, created_at)
       VALUES ('a1', ?, 'SHELL OIL', '2026-08-01')`,
			[vendor.id]
		);

		const before = await tableCounts(conn);
		expect(before.reduce((sum, c) => sum + c.count, 0)).toBeGreaterThan(0);

		const after = await truncateAll(conn);
		expect(after).toHaveLength(10);
		for (const c of after) expect(c.count).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/repos/admin.test.ts`
Expected: FAIL with "Failed to resolve import .../admin" (module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/server/repos/admin.ts`:

```ts
import type { DuckDBConnection } from '@duckdb/node-api';

export interface TableCount {
	table: string;
	count: number;
}

const TABLES = [
	'account_transactions',
	'rule_vendors',
	'vendor_aliases',
	'budget_category_months',
	'rules',
	'budget_categories',
	'accounts',
	'vendors',
	'budgets',
	'owners',
];

export async function tableCounts(conn: DuckDBConnection): Promise<TableCount[]> {
	const counts: TableCount[] = [];
	for (const table of TABLES) {
		const res = await conn.runAndReadAll(`SELECT count(*) AS n FROM ${table}`);
		counts.push({ table, count: Number(res.getRowObjects()[0].n) });
	}
	return counts;
}

export async function truncateAll(conn: DuckDBConnection): Promise<TableCount[]> {
	await conn.run('BEGIN TRANSACTION');
	try {
		for (const table of TABLES) {
			await conn.run(`DELETE FROM ${table}`);
		}
		await conn.run('COMMIT');
	} catch (err) {
		await conn.run('ROLLBACK');
		throw err;
	}
	return tableCounts(conn);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/repos/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/repos/admin.ts src/lib/server/repos/admin.test.ts
git commit -m "feat: add truncateAll admin repo function"
```

---

### Task 2: `createOwner` repo function + tests

**Files:**
- Modify: `src/lib/server/repos/budgets.ts`
- Test: `src/lib/server/repos/budgets.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createOwner(conn: DuckDBConnection, name: string): Promise<Owner>` — trims the name, throws on empty/duplicate, inserts and returns `{ id, name }`.

- [ ] **Step 1: Write the failing test**

Append a `describe` block to `src/lib/server/repos/budgets.test.ts`:

```ts
describe('createOwner', () => {
	it('creates an owner', async () => {
		const conn = await createTestDb();
		const created = await createOwner(conn, 'Kids');
		expect(created.name).toBe('Kids');
		expect((await listOwners(conn)).map((o) => o.name)).toContain('Kids');
	});

	it('rejects duplicate and blank names', async () => {
		const conn = await createTestDb();
		await createOwner(conn, 'Kids');
		await expect(createOwner(conn, 'Kids')).rejects.toThrow(/already exists/);
		await expect(createOwner(conn, '   ')).rejects.toThrow(/cannot be empty/);
	});
});
```

Add `createOwner` to the existing import line at the top of `budgets.test.ts` (the file already imports `createTestDb`, `listOwners`, `createBudget`, `createBudgetCategory` from their modules — add `createOwner` to the `'./budgets'` import).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/repos/budgets.test.ts`
Expected: FAIL with `createOwner is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/server/repos/budgets.ts` after `listOwners`:

```ts
export async function createOwner(conn: DuckDBConnection, name: string): Promise<Owner> {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Owner name cannot be empty');
	const existing = await conn.runAndReadAll('SELECT id FROM owners WHERE name = ?', [trimmed]);
	if (existing.getRowObjects().length > 0) throw new Error(`Owner already exists: ${trimmed}`);
	const id = randomUUID();
	await conn.run('INSERT INTO owners (id, name) VALUES (?, ?)', [id, trimmed]);
	return { id, name: trimmed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/repos/budgets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/repos/budgets.ts src/lib/server/repos/budgets.test.ts
git commit -m "feat: add createOwner repo function"
```

---

### Task 3: Remove the auto-seeder from `getDb()`

**Files:**
- Modify: `src/lib/server/db.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `getDb()` still applies `SCHEMA_SQL` but no longer calls `seedDefaults`. `getDbPath()` unchanged.

- [ ] **Step 1: Edit `db.ts`**

Remove the import `import { seedDefaults } from './seed';` and the line `await seedDefaults(conn);` inside `getDb()`. The result:

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { SCHEMA_SQL } from './schema';

const g = globalThis as unknown as { __financeDbConnection?: DuckDBConnection };

export function getDbPath(): string {
	return process.env.FINANCE_DB_PATH ?? 'data/finance.db';
}

export async function getDb(): Promise<DuckDBConnection> {
	if (g.__financeDbConnection) return g.__financeDbConnection;
	const path = getDbPath();
	mkdirSync(dirname(path), { recursive: true });
	const instance = await DuckDBInstance.create(path);
	const conn = await instance.connect();
	await conn.run(SCHEMA_SQL);
	g.__financeDbConnection = conn;
	return conn;
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. (`db.test.ts` and all repo tests seed via `createTestDb()`, which still calls `seedDefaults` — unchanged.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/db.ts
git commit -m "refactor: stop auto-seeding defaults on db open"
```

---

### Task 4: `sample-data.ts` creates missing owners

**Files:**
- Modify: `scripts/sample-data.ts`

**Interfaces:**
- Consumes: `createOwner` from Task 2.
- Produces: `npm run sample-data` works against a fresh (empty) DB by creating owners `Me` and `Family` when absent.

- [ ] **Step 1: Edit `sample-data.ts`**

Change the import line to also bring in `createOwner` (it already imports `listOwners`, `createBudget`, `createBudgetCategory` from `'../src/lib/server/repos/budgets'`):

```ts
import {
	listOwners,
	createOwner,
	createBudget,
	createBudgetCategory,
} from '../src/lib/server/repos/budgets';
```

Add an `ensureOwner` helper next to the other `ensure*` helpers, then replace the `me`/`family` lines:

```ts
async function ensureOwner(name: string) {
	const existing = await conn.runAndReadAll('SELECT id FROM owners WHERE name = ?', [name]);
	const rows = existing.getRowObjects();
	return rows.length > 0 ? { id: String(rows[0].id) } : createOwner(conn, name);
}
```

Replace:

```ts
const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
const family = (await listOwners(conn)).find((o) => o.name === 'Family')!;
```

with:

```ts
const me = await ensureOwner('Me');
const family = await ensureOwner('Family');
```

If `listOwners` is now unused after this change, remove it from the import to satisfy `@typescript-eslint/no-unused-vars`.

- [ ] **Step 2: Run the script against a fresh DB**

Run:

```bash
rm -f /tmp/opencode/plan-sample.db
FINANCE_DB_PATH=/tmp/opencode/plan-sample.db npm run sample-data
```

Expected: prints "Sample data seeded." with no crash. Then verify owners exist:

```bash
node /tmp/opencode/inspect-db.mjs /tmp/opencode/plan-sample.db
```

Expected: `owners 2n` (Me, Family — the script creates exactly the owners it needs; Wife was previously supplied by the removed auto-seeder), `accounts 2n`, `account_transactions 4n` (the script's fixed 4 sample rows).

- [ ] **Step 3: Commit**

```bash
git add scripts/sample-data.ts
git commit -m "fix: sample-data script creates owners when missing"
```

---

### Task 5: `adminData` page-data loader

**Files:**
- Modify: `src/lib/server/page-data.ts`

**Interfaces:**
- Consumes: `tableCounts` from Task 1, `listOwners` (already imported).
- Produces: `adminData(conn: DuckDBConnection): Promise<AdminData>` where `AdminData = { counts: { table: string; count: number }[]; owners: { id: string; name: string }[] }`.

- [ ] **Step 1: Edit `page-data.ts`**

Add the import and the loader:

```ts
import { tableCounts } from './repos/admin';
```

```ts
export interface AdminData {
	counts: { table: string; count: number }[];
	owners: Awaited<ReturnType<typeof listOwners>>;
}

export async function adminData(conn: DuckDBConnection): Promise<AdminData> {
	return {
		counts: await tableCounts(conn),
		owners: await listOwners(conn),
	};
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/page-data.ts
git commit -m "feat: add adminData page-data loader"
```

---

### Task 6: Admin server route, reset API, and owners API

**Files:**
- Create: `src/routes/admin/+page.server.ts`
- Create: `src/routes/api/admin/reset/+server.ts`
- Create: `src/routes/api/owners/+server.ts`

**Interfaces:**
- Consumes: `adminData` (Task 5), `truncateAll` (Task 1), `createOwner` (Task 2), `getDb`.
- Produces: `GET /admin` load data; `POST /api/admin/reset` → `{ counts: TableCount[] }`; `POST /api/owners` `{ name }` → `Owner` or 400.

- [ ] **Step 1: Create `src/routes/admin/+page.server.ts`**

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { adminData } from '$lib/server/page-data';

export const load: PageServerLoad = async () => {
	const conn = await getDb();
	return adminData(conn);
};
```

- [ ] **Step 2: Create `src/routes/api/admin/reset/+server.ts`**

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { truncateAll } from '$lib/server/repos/admin';

export const POST: RequestHandler = async () => {
	const conn = await getDb();
	return json({ counts: await truncateAll(conn) });
};
```

- [ ] **Step 3: Create `src/routes/api/owners/+server.ts`**

```ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createOwner } from '$lib/server/repos/budgets';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	try {
		return json(await createOwner(conn, String(body.name ?? '')));
	} catch (err) {
		throw error(400, (err as Error).message);
	}
};
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin/+page.server.ts src/routes/api/admin/reset/+server.ts src/routes/api/owners/+server.ts
git commit -m "feat: add admin and owners API endpoints"
```

---

### Task 7: Admin page UI

**Files:**
- Create: `src/routes/admin/+page.svelte`

**Interfaces:**
- Consumes: `data.counts`, `data.owners` from the Task 6 load.
- Produces: the Admin page rendering counts, the reset action, and the owners section.

- [ ] **Step 1: Create `src/routes/admin/+page.svelte`**

```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import Field from '$lib/components/Field.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { toastStore } from '$lib/toasts.svelte';

	let { data } = $props();

	let ownerName = $state('');
	let adding = $state(false);

	async function resetAll() {
		try {
			const res = await fetch('/api/admin/reset', { method: 'POST' });
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			const result = await res.json();
			const rows = result.counts.reduce(
				(sum: number, c: { count: number }) => sum + c.count,
				0
			);
			toastStore.add('ok', `Reset complete · ${rows} rows remaining`);
			await invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		}
	}

	async function addOwner(e: SubmitEvent) {
		e.preventDefault();
		adding = true;
		try {
			const res = await fetch('/api/owners', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: ownerName }),
			});
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			ownerName = '';
			toastStore.add('ok', 'Owner added');
			await invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		} finally {
			adding = false;
		}
	}
</script>

<PageHeader title="Admin" subtitle="Maintenance and danger zone" />

<h2>Reset all data</h2>
<Card>
	<p>
		Deletes every row from all tables. Owners, budgets, categories, accounts, vendors, rules,
		and transactions are all removed. This cannot be undone.
	</p>
	<ConfirmDelete label="Reset all data" confirmLabel="Reset all data" onconfirm={resetAll} />
</Card>

<h2>Owners</h2>
<form class="form-row" onsubmit={addOwner}>
	<Field label="Owner name">
		<input class="control" bind:value={ownerName} placeholder="Owner name" />
	</Field>
	<Button type="submit" variant="primary" busy={adding}>Add owner</Button>
</form>

<ul class="rows">
	{#each data.owners as owner (owner.id)}
		<li>{owner.name}</li>
	{/each}
</ul>
{#if data.owners.length === 0}
	<p class="empty">No owners yet. Add one above so you can create budgets.</p>
{/if}

<h2>Row counts</h2>
<table>
	<thead>
		<tr>
			<th>Table</th>
			<th class="end">Rows</th>
		</tr>
	</thead>
	<tbody>
		{#each data.counts as row (row.table)}
			<tr>
				<td>{row.table}</td>
				<td class="end num">{row.count}</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	h2 {
		margin-top: var(--space-6);
		margin-bottom: var(--space-3);
		font-size: var(--text-lg);
	}

	.form-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
	}

	.rows {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.rows li {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}

	.rows li:hover {
		background: var(--surface-hover);
	}

	.empty {
		margin-top: var(--space-2);
		color: var(--text-secondary);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		border-bottom: 1px solid var(--border-default);
	}

	.end {
		text-align: right;
	}

	.num {
		font-variant-numeric: tabular-nums;
	}
</style>
```

Note: `Button` accepts the `busy` prop (`busy={adding}`) to show its spinner while the request is in flight.

- [ ] **Step 2: Type-check and lint**

Run: `npm run check && npm run lint`
Expected: PASS. If `svelte/no-navigation-without-resolve` or `svelte/require-each-key` fire, the keys are already present (`(owner.id)`, `(row.table)`).

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin/+page.svelte
git commit -m "feat: add admin page with reset and owner management"
```

---

### Task 8: Nav rail link and admin icon

**Files:**
- Modify: `src/lib/components/NavRail.svelte`
- Modify: `src/lib/components/Icon.svelte`

**Interfaces:**
- Consumes: nothing new.
- Produces: an "Admin" nav item using the `admin` icon name.

- [ ] **Step 1: Add the icon to `Icon.svelte`**

Append before the closing `{/if}` of the icon switch (after the `rules` branch):

```svelte
{:else if name === 'admin'}
	<circle cx="12" cy="12" r="3" />
	<path
		d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
	/>
```

- [ ] **Step 2: Add the link to `NavRail.svelte`**

Append to the end of the `links` array in `NavRail.svelte`:

```ts
		{ href: '/admin', icon: 'admin', label: 'Admin' },
```

The array stays `as const`.

- [ ] **Step 3: Type-check and lint**

Run: `npm run check && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/NavRail.svelte src/lib/components/Icon.svelte
git commit -m "feat: add admin nav item and icon"
```

---

### Task 9: Docs update and full verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` (only if wording about first-run seeding is found)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Update README seeding wording**

In `README.md`, the "Getting started" section says:

```
Open the printed localhost URL. First run seeds the defaults (owners: Me, Wife, Family) and creates the DuckDB file at data/finance.db.
```

Replace with:

```
Open the printed localhost URL. First run creates the DuckDB schema file at data/finance.db. Owners are created manually from the Admin tab.
```

- [ ] **Step 2: Check AGENTS.md**

Grep AGENTS.md for "seed" / "First run". The manual e2e flow already calls `npm run sample-data`, which now creates owners itself — no change needed unless a "first run seeds defaults" claim exists; if it does, align it with the README wording.

- [ ] **Step 3: Run the full verification gate**

Run: `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`
Expected: ALL PASS.

- [ ] **Step 4: Manual e2e against a throwaway DB**

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
rm -f /tmp/opencode/admin-e2e.db
FINANCE_DB_PATH=/tmp/opencode/admin-e2e.db npm run sample-data
setsid env FINANCE_DB_PATH=/tmp/opencode/admin-e2e.db npm run dev > /tmp/opencode/dev.log 2>&1 < /dev/null &
sleep 6
```

Then:

```bash
curl -s http://localhost:5173/admin | grep -q "Admin" && echo "admin page OK" || echo "admin page FAIL"
curl -s -X POST http://localhost:5173/api/owners -H 'content-type: application/json' -d '{"name":"Kids"}' | grep -q "Kids" && echo "owner create OK" || echo "owner create FAIL"
curl -s -X POST http://localhost:5173/api/admin/reset | grep -q '"count":0' && echo "reset OK" || echo "reset FAIL"
curl -s http://localhost:5173/api/accounts
```

Expected: `admin page OK`, `owner create OK`, `reset OK`, and the last call returns `[]`. Stop the server when done: `pkill -f "vite dev"`.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: update seeding wording for admin-managed owners"
```