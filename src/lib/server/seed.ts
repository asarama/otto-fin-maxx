import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

const OWNER_NAMES = ['Me', 'Wife', 'Family'];

export async function seedDefaults(conn: DuckDBConnection): Promise<void> {
	for (const name of OWNER_NAMES) {
		const owners = await conn.runAndReadAll('SELECT id FROM owners WHERE name = ?', [name]);
		let ownerId: string;
		if (owners.getRowObjects().length === 0) {
			ownerId = randomUUID();
			await conn.run('INSERT INTO owners (id, name) VALUES (?, ?)', [ownerId, name]);
		} else {
			ownerId = String(owners.getRowObjects()[0].id);
		}

		const budgets = await conn.runAndReadAll(
			'SELECT id FROM budgets WHERE owner_id = ? AND name = ?',
			[ownerId, name]
		);
		let budgetId: string;
		if (budgets.getRowObjects().length === 0) {
			budgetId = randomUUID();
			await conn.run('INSERT INTO budgets (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)', [
				budgetId,
				ownerId,
				name,
				new Date().toISOString(),
			]);
		} else {
			budgetId = String(budgets.getRowObjects()[0].id);
		}

		const cats = await conn.runAndReadAll(
			'SELECT id FROM budget_categories WHERE budget_id = ? AND name = ?',
			[budgetId, 'General']
		);
		if (cats.getRowObjects().length === 0) {
			const catId = randomUUID();
			await conn.run(
				'INSERT INTO budget_categories (id, budget_id, name, monthly_limit_cents, created_at) VALUES (?, ?, ?, ?, ?)',
				[catId, budgetId, 'General', 0, new Date().toISOString()]
			);
		}
	}
}
