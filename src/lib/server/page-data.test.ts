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

	it('excludes ignored transactions that still reference a category month', async () => {
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
       (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at, budget_category_month_id, ignored)
       VALUES ('tx2', ?, 'e2', '2026-07-06', 'STORE', NULL, -3000, NULL, 'manual', '2026-07-06', ?, true)`,
			[account.id, month.id]
		);

		const data = await dashboardData(conn, '2026-07');
		expect(data.categories.find((c) => c.budgetCategoryId === cat.id)?.spentCents).toBe(0);
	});
});
