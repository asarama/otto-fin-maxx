import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { listOwners, createBudget, createBudgetCategory } from './budgets';
import { createVendor } from './vendors';
import { listRules, createRule, updateRule, deleteRule, moveRule } from './rules';

async function makeCategory(conn: Awaited<ReturnType<typeof createTestDb>>) {
	const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
	const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
	return createBudgetCategory(conn, {
		budgetId: budget.id,
		name: 'Gaming',
		monthlyLimitCents: 10000,
	});
}

describe('rules repo', () => {
	it('creates, lists, updates, and deletes rules', async () => {
		const conn = await createTestDb();
		const cat = await makeCategory(conn);
		const amazon = await createVendor(conn, 'Amazon');

		const rule = await createRule(conn, {
			name: 'Amazon',
			descriptionMatcher: '^AMZN',
			amountOperator: 'lt',
			amountCents: 5000,
			budgetCategoryId: cat.id,
			priority: 1,
			vendorIds: [amazon.id],
		});
		expect(rule.vendorIds).toEqual([amazon.id]);

		let rules = await listRules(conn);
		expect(rules).toHaveLength(1);
		expect(rules[0].descriptionMatcher).toBe('^AMZN');

		await updateRule(conn, rule.id, { amountOperator: 'gte', amountCents: 100 });
		rules = await listRules(conn);
		expect(rules[0].amountOperator).toBe('gte');

		await deleteRule(conn, rule.id);
		expect(await listRules(conn)).toHaveLength(0);
	});

	it('moves a rule up or down by swapping priorities', async () => {
		const conn = await createTestDb();
		const cat = await makeCategory(conn);
		const a = await createRule(conn, { name: 'A', budgetCategoryId: cat.id, priority: 1 });
		const b = await createRule(conn, { name: 'B', budgetCategoryId: cat.id, priority: 2 });

		await moveRule(conn, a.id, 'down');
		let rules = await listRules(conn);
		expect(rules.map((r) => r.id)).toEqual([b.id, a.id]);

		await moveRule(conn, a.id, 'up');
		rules = await listRules(conn);
		expect(rules.map((r) => r.id)).toEqual([a.id, b.id]);
	});
});
