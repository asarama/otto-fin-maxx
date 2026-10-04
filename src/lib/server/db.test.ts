import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from './test-helpers';
import { seedDefaults } from './seed';
import { getDb } from './db';

const cache = globalThis as unknown as {
	__financeDbConnection?: unknown;
	__financeDbPromise?: unknown;
};

function resetDbCache() {
	delete cache.__financeDbConnection;
	delete cache.__financeDbPromise;
}

describe('schema + seed', () => {
	it('creates all tables', async () => {
		const conn = await createTestDb();
		const res = await conn.runAndReadAll(
			`SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'main' ORDER BY table_name`
		);
		const names = res.getRowObjects().map((r) => r.table_name);
		expect(names).toEqual([
			'account_transactions',
			'accounts',
			'budget_categories',
			'budget_category_months',
			'budgets',
			'owners',
			'rule_vendors',
			'rules',
			'vendor_aliases',
			'vendors',
		]);
	});

	it('seeds owners, budgets, and General categories', async () => {
		const conn = await createTestDb();
		const owners = await conn.runAndReadAll('SELECT name FROM owners ORDER BY name');
		expect(owners.getRowObjects().map((r) => r.name)).toEqual(['Family', 'Me', 'Wife']);
		const cats = await conn.runAndReadAll(
			'SELECT bc.name FROM budget_categories bc JOIN budgets b ON b.id = bc.budget_id'
		);
		expect(cats.getRowObjects()).toHaveLength(3);
		for (const row of cats.getRowObjects()) expect(row.name).toBe('General');
	});

	it('seed is idempotent', async () => {
		const conn = await createTestDb();
		await seedDefaults(conn);
		const owners = await conn.runAndReadAll('SELECT count(*) AS n FROM owners');
		expect(Number(owners.getRowObjects()[0].n)).toBe(3);
	});
});

describe('getDb', () => {
	const originalPath = process.env.FINANCE_DB_PATH;

	afterEach(() => {
		resetDbCache();
		if (originalPath === undefined) delete process.env.FINANCE_DB_PATH;
		else process.env.FINANCE_DB_PATH = originalPath;
	});

	it('returns one shared connection when called concurrently', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'finance-db-'));
		process.env.FINANCE_DB_PATH = join(dir, 'test.db');
		resetDbCache();
		try {
			const [a, b] = await Promise.all([getDb(), getDb()]);
			expect(b).toBe(a);
			expect(await getDb()).toBe(a);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
