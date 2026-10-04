# Ignore Payment Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, reversible "ignored" flag so payment/transfer transactions can be excluded from the review queue, budgets, and spend totals.

**Architecture:** Add an `ignored BOOLEAN` column to `account_transactions` (with an idempotent startup migration for existing DBs). Ignored rows get `assignment_status = 'manual'`, which naturally removes them from the `unreviewed` review queue, and have their `budget_category_month_id` cleared, which naturally excludes them from the spend join. Repo functions drive ignore/un-ignore; API routes and Svelte pages expose the actions.

**Tech Stack:** SvelteKit (Svelte 5 runes), DuckDB via `@duckdb/node-api`, Vitest, TypeScript.

## Global Constraints

- Node is on the mise shims path: `export PATH="$HOME/.local/share/mise/shims:$PATH"`.
- Formatting: tabs, single quotes, trailing commas (es5), 100 col; `npm run format` / `format:check`.
- No explanatory comments in code.
- Money is integer cents; dates `YYYY-MM-DD`; months `YYYY-MM`.
- Svelte 5 runes (`$props`, `$state`, `$derived`); every `{#each}` needs a key.
- `assignment_status` values: `'auto' | 'manual' | 'unreviewed'`. Rule runs touch only `'unreviewed'`.
- Full gate before claiming any task or the feature complete: `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.
- Never run experiments against `data/finance.db`; use `FINANCE_DB_PATH=/tmp/opencode/...`.

---

### Task 1: `ignored` column + idempotent migration

**Files:**
- Modify: `src/lib/server/schema.ts`
- Modify: `src/lib/server/db.ts`
- Test: `src/lib/server/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MIGRATIONS_SQL: string` exported from `src/lib/server/schema.ts`; `account_transactions.ignored BOOLEAN` (fresh DBs `NOT NULL DEFAULT false`, migrated DBs nullable default `false`).

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('schema + seed', ...)` block in `src/lib/server/db.test.ts`, and add the two imports at the top of the file:

```ts
import { DuckDBInstance } from '@duckdb/node-api';
import { MIGRATIONS_SQL } from './schema';
```

```ts
	it('migrates an existing account_transactions table to add ignored', async () => {
		const instance = await DuckDBInstance.create(':memory:');
		const conn = await instance.connect();
		await conn.run('CREATE TABLE account_transactions (id TEXT)');
		await conn.run(MIGRATIONS_SQL);
		await conn.run(MIGRATIONS_SQL);
		const res = await conn.runAndReadAll(
			`SELECT column_name FROM information_schema.columns
       WHERE table_name = 'account_transactions' AND column_name = 'ignored'`
		);
		expect(res.getRowObjects()).toHaveLength(1);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/db.test.ts`
Expected: FAIL — `MIGRATIONS_SQL` is not exported / is undefined.

- [ ] **Step 3: Add the column and the migration**

In `src/lib/server/schema.ts`, add the column to `account_transactions`:

```sql
  assignment_status TEXT NOT NULL DEFAULT 'unreviewed',
  ignored BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL
```

Then append after `SCHEMA_SQL`:

```ts
export const MIGRATIONS_SQL = `
ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS ignored BOOLEAN DEFAULT false;
`;
```

DuckDB cannot add a `NOT NULL` column via `ALTER TABLE` ("Adding columns with constraints not yet supported"), which is why the migration default is nullable; all reads treat `NULL` as not ignored.

- [ ] **Step 4: Run the migration at startup**

In `src/lib/server/db.ts`, change the schema import and add the migration call:

```ts
import { SCHEMA_SQL, MIGRATIONS_SQL } from './schema';
```

```ts
	await conn.run(SCHEMA_SQL);
	await conn.run(MIGRATIONS_SQL);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/db.test.ts`
Expected: PASS (all tests, including the new migration test).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/schema.ts src/lib/server/db.ts src/lib/server/db.test.ts
git commit -m "feat: add ignored column with idempotent migration"
```

---

### Task 2: Repo support for ignoring / un-ignoring

**Files:**
- Modify: `src/lib/server/repos/transactions.ts`
- Test: `src/lib/server/repos/transactions.test.ts`

**Interfaces:**
- Consumes: `ignored` column from Task 1.
- Produces:
  - `Transaction` gains `ignored: boolean`.
  - `TransactionFilters` gains `ignored?: boolean` (`true` → only ignored; `false` → only not-ignored).
  - `ignoreTransactions(conn: DuckDBConnection, txIds: string[]): Promise<void>` — sets `ignored = true`, `assignment_status = 'manual'`, `budget_category_month_id = NULL`; empty array is a no-op.
  - `unignoreTransaction(conn: DuckDBConnection, txId: string): Promise<void>` — sets `ignored = false`, `assignment_status = 'unreviewed'`, `budget_category_month_id = NULL`.
  - `assignTransaction` additionally sets `ignored = false`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/server/repos/transactions.test.ts`, extend the import from `./transactions`:

```ts
import {
	listTransactions,
	countUnreviewed,
	getUnreviewed,
	assignTransaction,
	ignoreTransactions,
	unignoreTransaction,
} from './transactions';
```

Add these tests inside `describe('transactions repo', ...)`:

```ts
	it('ignores transactions: sets flag, manual status, clears category', async () => {
		const conn = await createTestDb();
		await seedTx(conn);
		const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
		const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
		const cat = await createBudgetCategory(conn, {
			budgetId: budget.id,
			name: 'Gaming',
			monthlyLimitCents: 10000,
		});
		const month = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
		await assignTransaction(conn, 'tx1', month.id);

		await ignoreTransactions(conn, ['tx1']);

		const t = (await listTransactions(conn, {}))[0];
		expect(t.ignored).toBe(true);
		expect(t.assignmentStatus).toBe('manual');
		expect(t.budgetCategoryMonthId).toBeNull();
	});

	it('un-ignores a transaction back to unreviewed', async () => {
		const conn = await createTestDb();
		await seedTx(conn);
		await ignoreTransactions(conn, ['tx1']);
		await unignoreTransaction(conn, 'tx1');
		const t = (await listTransactions(conn, {}))[0];
		expect(t.ignored).toBe(false);
		expect(t.assignmentStatus).toBe('unreviewed');
	});

	it('assigning a category clears the ignored flag', async () => {
		const conn = await createTestDb();
		await seedTx(conn);
		const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
		const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
		const cat = await createBudgetCategory(conn, {
			budgetId: budget.id,
			name: 'Gaming',
			monthlyLimitCents: 10000,
		});
		const month = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
		await ignoreTransactions(conn, ['tx1']);

		await assignTransaction(conn, 'tx1', month.id);

		const t = (await listTransactions(conn, {}))[0];
		expect(t.ignored).toBe(false);
		expect(t.assignmentStatus).toBe('manual');
	});

	it('excludes ignored transactions from the review queue', async () => {
		const conn = await createTestDb();
		await seedTx(conn);
		await seedTx(conn, { id: 'tx2', externalId: 'e2' });
		await ignoreTransactions(conn, ['tx1']);
		expect(await countUnreviewed(conn)).toBe(1);
		expect((await getUnreviewed(conn)).map((t) => t.id)).toEqual(['tx2']);
	});

	it('filters by ignored flag', async () => {
		const conn = await createTestDb();
		await seedTx(conn);
		await seedTx(conn, { id: 'tx2', externalId: 'e2' });
		await ignoreTransactions(conn, ['tx1']);
		expect((await listTransactions(conn, { ignored: true })).map((t) => t.id)).toEqual(['tx1']);
		expect((await listTransactions(conn, { ignored: false })).map((t) => t.id)).toEqual(['tx2']);
	});

	it('ignoreTransactions is a no-op for an empty list', async () => {
		const conn = await createTestDb();
		await expect(ignoreTransactions(conn, [])).resolves.toBeUndefined();
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/repos/transactions.test.ts`
Expected: FAIL — `ignoreTransactions`/`unignoreTransaction` not exported; `ignored` missing.

- [ ] **Step 3: Implement the repo changes**

In `src/lib/server/repos/transactions.ts`:

Add to `Transaction`:

```ts
	assignmentStatus: string;
	ignored: boolean;
```

Add to `rowToTransaction` return (after `assignmentStatus`):

```ts
		ignored: Boolean(row.ignored),
```

Add to `TransactionFilters`:

```ts
	ignored?: boolean;
```

In `listTransactions`, after the `status` filter block:

```ts
	if (filters.ignored === true) {
		where.push('ignored = true');
	} else if (filters.ignored === false) {
		where.push('ignored IS NOT TRUE');
	}
```

Change `assignTransaction` to clear the flag:

```ts
	await conn.run(
		'UPDATE account_transactions SET budget_category_month_id = ?, assignment_status = ?, ignored = false WHERE id = ?',
		[budgetCategoryMonthId, 'manual', txId]
	);
```

Append the two new functions:

```ts
export async function ignoreTransactions(conn: DuckDBConnection, txIds: string[]): Promise<void> {
	if (txIds.length === 0) return;
	const placeholders = txIds.map(() => '?').join(', ');
	await conn.run(
		`UPDATE account_transactions
     SET ignored = true, assignment_status = 'manual', budget_category_month_id = NULL
     WHERE id IN (${placeholders})`,
		txIds
	);
}

export async function unignoreTransaction(conn: DuckDBConnection, txId: string): Promise<void> {
	await conn.run(
		`UPDATE account_transactions
     SET ignored = false, assignment_status = 'unreviewed', budget_category_month_id = NULL
     WHERE id = ?`,
		[txId]
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/repos/transactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npx vitest run`
Expected: PASS. (`importCsv`/`budgets` tests still pass; `assignTransaction` now also clears `ignored`, which is already `false` in existing tests.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/repos/transactions.ts src/lib/server/repos/transactions.test.ts
git commit -m "feat: repo support for ignoring transactions"
```

---

### Task 3: Exclude ignored transactions from spend

**Files:**
- Modify: `src/lib/server/page-data.ts`
- Test: `src/lib/server/page-data.test.ts` (create)

**Interfaces:**
- Consumes: `ignoreTransactions`, `assignTransaction` (Task 2); `dashboardData`.
- Produces: `categoryMonthRows`'s transaction join excludes ignored rows, so `DashboardData.categories[].spentCents` (and `totalSpent`) omit them.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/page-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-helpers';
import { createAccount } from './repos/accounts';
import { assignTransaction, ignoreTransactions } from './repos/transactions';
import {
	listOwners,
	createBudget,
	createBudgetCategory,
	ensureBudgetCategoryMonth,
} from './repos/budgets';
import { dashboardData } from './page-data';

describe('dashboard spend', () => {
	it('excludes ignored transactions from spentCents', async () => {
		const conn = await createTestDb();
		const account = await createAccount(conn, {
			name: 'CapOne',
			bank: 'capital_one',
			type: 'credit',
		});
		const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
		const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
		const cat = await createBudgetCategory(conn, {
			budgetId: budget.id,
			name: 'Gaming',
			monthlyLimitCents: 10000,
		});
		const month = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
		await conn.run(
			`INSERT INTO account_transactions
       (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
       VALUES ('tx1', ?, 'e1', '2026-07-05', 'STORE', NULL, -5000, NULL, 'unreviewed', '2026-07-05')`,
			[account.id]
		);
		await assignTransaction(conn, 'tx1', month.id);

		const before = await dashboardData(conn, '2026-07');
		expect(before.categories.find((c) => c.budgetCategoryId === cat.id)?.spentCents).toBe(5000);

		await ignoreTransactions(conn, ['tx1']);

		const after = await dashboardData(conn, '2026-07');
		expect(after.categories.find((c) => c.budgetCategoryId === cat.id)?.spentCents).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/page-data.test.ts`
Expected: FAIL — after ignoring, `spentCents` is still `5000` because the join does not check `ignored`.

- [ ] **Step 3: Add the exclusion to the spend join**

In `src/lib/server/page-data.ts`, change the `categoryMonthRows` join line:

```sql
     LEFT JOIN account_transactions tx ON tx.budget_category_month_id = bcm.id
       AND (tx.ignored IS NOT TRUE)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/page-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/page-data.ts src/lib/server/page-data.test.ts
git commit -m "feat: exclude ignored transactions from budget spend"
```

---

### Task 4: Ignore from the review queue

**Files:**
- Create: `src/routes/api/review/ignore/+server.ts`
- Modify: `src/routes/review/+page.svelte`

**Interfaces:**
- Consumes: `ignoreTransactions` (Task 2).
- Produces: `POST /api/review/ignore` with JSON body `{ txIds: string[] }` → `{ ignored: number }`.

- [ ] **Step 1: Create the bulk ignore endpoint**

Create `src/routes/api/review/ignore/+server.ts`, mirroring `api/review/batch/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { ignoreTransactions } from '$lib/server/repos/transactions';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	const txIds = Array.isArray(body.txIds) ? body.txIds.map(String) : [];
	await ignoreTransactions(conn, txIds);
	return json({ ignored: txIds.length });
};
```

- [ ] **Step 2: Add the ignore handler to the review page script**

In `src/routes/review/+page.svelte`, add after `batchAssign()`:

```ts
	async function ignore(txIds: string[]) {
		if (txIds.length === 0) return;
		try {
			const res = await fetch('/api/review/ignore', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ txIds }),
			});
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			const { ignored } = await res.json();
			selected.clear();
			toastStore.add('ok', `Ignored ${ignored} transaction(s)`);
			invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		}
	}
```

- [ ] **Step 3: Add the bulk Ignore button**

In the `<form class="form-row">` toolbar, after the `Run rules` button, add:

```svelte
	<Button
		variant="secondary"
		onclick={() => ignore([...selected])}
		disabled={selected.size === 0}
	>
		Ignore {selected.size} selected
	</Button>
```

- [ ] **Step 4: Add the per-row Ignore button**

In the row list, after the closing `</label>` of `.row` and before `<details>`, add:

```svelte
			<Button variant="secondary" onclick={() => ignore([tx.id])}>Ignore</Button>
```

- [ ] **Step 5: Verify**

Run: `npm run check`
Expected: PASS (no type errors).

Manual e2e (see AGENTS.md "End-to-end verification"): with a throwaway DB, click **Ignore** on a payment row and **Ignore N selected** on a selection; rows disappear and the nav badge count drops.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/review/ignore src/routes/review/+page.svelte
git commit -m "feat: ignore transactions from the review queue"
```

---

### Task 5: Ignore/un-ignore from the transactions page

**Files:**
- Create: `src/routes/api/transactions/[id]/ignore/+server.ts`
- Create: `src/routes/api/transactions/[id]/unignore/+server.ts`
- Modify: `src/routes/transactions/+page.server.ts`
- Modify: `src/routes/transactions/+page.svelte`

**Interfaces:**
- Consumes: `ignoreTransactions`, `unignoreTransaction` (Task 2); `TransactionFilters.ignored` (Task 2).
- Produces:
  - `POST /api/transactions/[id]/ignore` → `{ ok: true }`.
  - `POST /api/transactions/[id]/unignore` → `{ ok: true }`.
  - The transactions page status filter supports `ignored`.

- [ ] **Step 1: Create the single ignore endpoint**

Create `src/routes/api/transactions/[id]/ignore/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { ignoreTransactions } from '$lib/server/repos/transactions';

export const POST: RequestHandler = async ({ params }) => {
	const conn = await getDb();
	await ignoreTransactions(conn, [params.id]);
	return json({ ok: true });
};
```

- [ ] **Step 2: Create the un-ignore endpoint**

Create `src/routes/api/transactions/[id]/unignore/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { unignoreTransaction } from '$lib/server/repos/transactions';

export const POST: RequestHandler = async ({ params }) => {
	const conn = await getDb();
	await unignoreTransaction(conn, params.id);
	return json({ ok: true });
};
```

- [ ] **Step 3: Map the status filter in the page loader**

In `src/routes/transactions/+page.server.ts`, replace the `load` body:

```ts
export const load: PageServerLoad = async ({ url }) => {
	const conn = await getDb();
	const status = url.searchParams.get('status') ?? undefined;
	return transactionsData(conn, {
		accountId: url.searchParams.get('account') ?? undefined,
		month: url.searchParams.get('month') ?? undefined,
		search: url.searchParams.get('search') ?? undefined,
		status: status && status !== 'ignored' ? status : undefined,
		ignored: status === 'ignored' ? true : status === 'manual' ? false : undefined,
	});
};
```

- [ ] **Step 4: Add page actions and display**

In `src/routes/transactions/+page.svelte`:

Change the `status` state initializer so an `ignored` filter is preselected:

```ts
	let status = $state(data.filters.ignored ? 'ignored' : (data.filters.status ?? ''));
```

Add the `ignored` option to the Status `<select>`:

```svelte
			<option value="ignored">ignored</option>
```

Add the handlers after `assign(...)`:

```ts
	async function ignore(txId: string) {
		await fetch(`/api/transactions/${txId}/ignore`, { method: 'POST' });
		invalidateAll();
	}

	async function unignore(txId: string) {
		await fetch(`/api/transactions/${txId}/unignore`, { method: 'POST' });
		invalidateAll();
	}
```

Change the Status cell:

```svelte
				<td>{tx.ignored ? 'ignored' : tx.assignmentStatus}</td>
```

Change the action `<td>` (the one holding the category `<select>`) to append the button:

```svelte
				<td class="actions">
					<select
						class="control"
						aria-label="Assign category for {tx.description}"
						onchange={(e) =>
							assign(
								tx.id,
								(e.currentTarget as HTMLSelectElement).value,
								tx.postedDate.slice(0, 7)
							)}
					>
						<option value="">assign category</option>
						{#each data.budgetCategories as cat (cat.id)}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
					{#if tx.ignored}
						<Button variant="secondary" size="sm" onclick={() => unignore(tx.id)}>
							Un-ignore
						</Button>
					{:else}
						<Button variant="secondary" size="sm" onclick={() => ignore(tx.id)}>Ignore</Button>
					{/if}
				</td>
```

`Button` is already imported in this file.

- [ ] **Step 5: Verify**

Run: `npm run check`
Expected: PASS.

Manual e2e on a throwaway DB: ignore a row, confirm the status shows `ignored` and `?status=ignored` lists it; select `manual` and confirm ignored rows are absent; un-ignore and confirm it returns to `unreviewed`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/transactions src/routes/transactions/+page.server.ts src/routes/transactions/+page.svelte
git commit -m "feat: ignore and un-ignore from the transactions page"
```

---

### Task 6: Document the convention and run the full gate

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: updated agent documentation; a green full gate.

- [ ] **Step 1: Update the assignment-status convention in `AGENTS.md`**

Replace the existing bullet:

```md
- `assignment_status`: `'auto' | 'manual' | 'unreviewed'`. Rule re-runs only touch `'unreviewed'`; never overwrite `'auto'`/`'manual'`.
```

with:

```md
- `assignment_status`: `'auto' | 'manual' | 'unreviewed'`. Rule re-runs only touch `'unreviewed'`; never overwrite `'auto'`/`'manual'`.
- `account_transactions.ignored`: a separate boolean column. Ignored rows carry `assignment_status = 'manual'` (so they leave the review queue) and `budget_category_month_id = NULL` (so they are excluded from budget spend). Assigning a category clears `ignored`. Existing DBs gain the column via `MIGRATIONS_SQL` run in `initDb()`.
```

- [ ] **Step 2: Run the full required gate**

Run:

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
npm run lint && npm run format:check && npm run check && npm run build && npx vitest run
```

Expected: all PASS. If `format:check` fails, run `npm run format` and re-run.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document ignored transactions convention"
```

---

## Self-Review

**Spec coverage:**
- Data model / own column + migration → Task 1.
- Status taxonomy, assign clears ignored → Task 1 (column) + Task 2.
- Review queue unchanged queries, rule safety → Task 2 (tests) — `categorizeUnreviewed` untouched, verified by existing import tests still passing.
- Spend exclusion → Task 3.
- Review queue UI (per-row + bulk) → Task 4.
- Transactions page UI (filter, status label, ignore/un-ignore) → Task 5.
- Docs → Task 6.

**Placeholder scan:** none — every step carries exact code/commands.

**Type consistency:** `ignored: boolean` on `Transaction`/`TransactionFilters`; `ignoreTransactions(conn, txIds: string[])`; `unignoreTransaction(conn, txId)`; `MIGRATIONS_SQL` — names match across Tasks 1–5.
