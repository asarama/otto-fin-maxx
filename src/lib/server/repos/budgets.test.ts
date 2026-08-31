import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import {
	createOwner,
	listOwners,
	listBudgets,
	createBudget,
	listBudgetCategories,
	createBudgetCategory,
	updateBudgetCategoryLimit,
	ensureBudgetCategoryMonth,
	listBudgetCategoryMonths,
	deleteBudgetCategory,
} from './budgets';
import { createAccount } from './accounts';
import { createVendor } from './vendors';

describe('budgets repo', () => {
	it('lists seeded owners', async () => {
		const conn = await createTestDb();
		const owners = await listOwners(conn);
		expect(owners.map((o) => o.name)).toEqual(['Family', 'Me', 'Wife']);
	});

	it('creates a budget and category under an owner', async () => {
		const conn = await createTestDb();
		const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
		const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
		const cat = await createBudgetCategory(conn, {
			budgetId: budget.id,
			name: 'Gaming',
			monthlyLimitCents: 10000,
		});

		const budgets = await listBudgets(conn);
		expect(budgets.some((b) => b.id === budget.id && b.owner_id === me.id)).toBe(true);

		const cats = await listBudgetCategories(conn);
		expect(cats.some((c) => c.id === cat.id && c.monthly_limit_cents === 10000)).toBe(true);

		await updateBudgetCategoryLimit(conn, cat.id, 15000);
		const updated = (await listBudgetCategories(conn)).find((c) => c.id === cat.id)!;
		expect(updated.monthly_limit_cents).toBe(15000);
	});

	it('ensures a month snapshot with the current limit', async () => {
		const conn = await createTestDb();
		const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
		const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
		const cat = await createBudgetCategory(conn, {
			budgetId: budget.id,
			name: 'Gaming',
			monthlyLimitCents: 10000,
		});

		const m1 = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
		const m2 = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
		expect(m1.id).toBe(m2.id);
		expect(m1.amount_cents).toBe(10000);

		const all = await listBudgetCategoryMonths(conn, '2026-07');
		expect(all).toHaveLength(1);
		expect(all[0].amount_cents).toBe(10000);
	});

	it('deleting a category returns its transactions to the review queue', async () => {
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
		const snapshot = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
		await conn.run(
			`INSERT INTO account_transactions
       (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, budget_category_month_id, assignment_status, created_at)
       VALUES ('t1', ?, 'e1', '2026-07-04', 'STEAM', 'STEAM', -2500, ?, 'manual', '2026-07-04')`,
			[account.id, snapshot.id]
		);
		await conn.run(
			`INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES ('r1', 'Steam', 'STEAM', 'any', NULL, ?, 1, true)`,
			[cat.id]
		);
		const vendor = await createVendor(conn, 'Steam');
		await conn.run("INSERT INTO rule_vendors (rule_id, vendor_id) VALUES ('r1', ?)", [vendor.id]);

		await deleteBudgetCategory(conn, cat.id);

		expect((await listBudgetCategories(conn)).some((c) => c.id === cat.id)).toBe(false);
		expect(await listBudgetCategoryMonths(conn, '2026-07')).toHaveLength(0);

		const tx = await conn.runAndReadAll(
			'SELECT budget_category_month_id, assignment_status FROM account_transactions WHERE id = ?',
			['t1']
		);
		expect(tx.getRowObjects()[0].budget_category_month_id).toBeNull();
		expect(tx.getRowObjects()[0].assignment_status).toBe('unreviewed');

		const rules = await conn.runAndReadAll('SELECT id FROM rules');
		expect(rules.getRowObjects()).toHaveLength(0);
		const ruleVendors = await conn.runAndReadAll('SELECT rule_id FROM rule_vendors');
		expect(ruleVendors.getRowObjects()).toHaveLength(0);
	});

	it('updating a limit preserves past snapshots and applies to future months', async () => {
		const conn = await createTestDb();
		const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
		const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
		const cat = await createBudgetCategory(conn, {
			budgetId: budget.id,
			name: 'Gaming',
			monthlyLimitCents: 10000,
		});

		await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
		await updateBudgetCategoryLimit(conn, cat.id, 15000);

		const july = await listBudgetCategoryMonths(conn, '2026-07');
		expect(july[0].amount_cents).toBe(10000);

		const august = await ensureBudgetCategoryMonth(conn, cat.id, '2026-08');
		expect(august.amount_cents).toBe(15000);
	});
});

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
