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
