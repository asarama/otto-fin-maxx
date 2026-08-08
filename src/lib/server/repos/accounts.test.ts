import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { listAccounts, createAccount, renameAccount, getAccount, deleteAccount } from './accounts';

describe('accounts repo', () => {
	it('creates, lists, renames, and fetches accounts', async () => {
		const conn = await createTestDb();
		const created = await createAccount(conn, {
			name: 'Capital One Quicksilver',
			bank: 'capital_one',
			type: 'credit',
		});
		expect(created.currency).toBe('USD');

		const all = await listAccounts(conn);
		expect(all).toHaveLength(1);
		expect(all[0].name).toBe('Capital One Quicksilver');

		await renameAccount(conn, created.id, 'CapOne');
		const fetched = await getAccount(conn, created.id);
		expect(fetched?.name).toBe('CapOne');
	});

	it('returns null for a missing account', async () => {
		const conn = await createTestDb();
		expect(await getAccount(conn, 'nope')).toBeNull();
	});

	it('deletes an account together with its imported transactions', async () => {
		const conn = await createTestDb();
		const kept = await createAccount(conn, { name: 'BMO', bank: 'bmo', type: 'debit' });
		const doomed = await createAccount(conn, {
			name: 'CapOne',
			bank: 'capital_one',
			type: 'credit',
		});
		for (const [id, accountId] of [
			['t1', doomed.id],
			['t2', kept.id],
		]) {
			await conn.run(
				`INSERT INTO account_transactions
         (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, assignment_status, created_at)
         VALUES (?, ?, ?, '2026-07-01', 'COFFEE', 'COFFEE', -500, 'unreviewed', '2026-07-01')`,
				[id, accountId, `e-${id}`]
			);
		}

		await deleteAccount(conn, doomed.id);

		expect((await listAccounts(conn)).map((a) => a.id)).toEqual([kept.id]);
		const tx = await conn.runAndReadAll('SELECT id FROM account_transactions');
		expect(tx.getRowObjects().map((r) => String(r.id))).toEqual(['t2']);
	});

	it('rejects an invalid bank or type', async () => {
		const conn = await createTestDb();
		await expect(
			createAccount(conn, { name: 'Bad', bank: 'chase', type: 'credit' })
		).rejects.toThrow();
		await expect(
			createAccount(conn, { name: 'Bad', bank: 'capital_one', type: 'prepaid' })
		).rejects.toThrow();
	});
});
