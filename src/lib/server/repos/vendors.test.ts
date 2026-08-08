import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { createAccount } from './accounts';
import {
	listVendors,
	createVendor,
	addVendorAlias,
	mergeVendors,
	deleteVendor,
	deleteVendorAlias,
} from './vendors';

describe('vendors repo', () => {
	it('creates a vendor with aliases and lists them', async () => {
		const conn = await createTestDb();
		const v = await createVendor(conn, 'Amazon', ['AMZN MKTP US']);
		const vendors = await listVendors(conn);
		expect(vendors).toHaveLength(1);
		expect(vendors[0].name).toBe('Amazon');
		expect(vendors[0].aliases.map((a) => a.name)).toEqual(['AMZN MKTP US']);
		expect(v.id).toBe(vendors[0].id);
	});

	it('adds an alias to an existing vendor', async () => {
		const conn = await createTestDb();
		const v = await createVendor(conn, 'Amazon');
		await addVendorAlias(conn, v.id, 'AMAZON.COM');
		const vendors = await listVendors(conn);
		expect(vendors[0].aliases.map((a) => a.name)).toEqual(['AMAZON.COM']);
	});

	it('merges two vendors, reassigning transactions', async () => {
		const conn = await createTestDb();
		const account = await createAccount(conn, {
			name: 'CapOne',
			bank: 'capital_one',
			type: 'credit',
		});
		const keep = await createVendor(conn, 'Amazon', ['AMZN MKTP US']);
		const remove = await createVendor(conn, 'Amazon Prime', ['PRIME VIDEO']);
		await conn.run(
			`INSERT INTO account_transactions
       (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				't1',
				account.id,
				'e1',
				'2026-07-01',
				'PRIME VIDEO',
				'PRIME VIDEO',
				-500,
				remove.id,
				'unreviewed',
				'2026-07-01',
			]
		);
		await mergeVendors(conn, keep.id, remove.id);

		const vendors = await listVendors(conn);
		expect(vendors).toHaveLength(1);
		expect(vendors[0].name).toBe('Amazon');
		expect(vendors[0].aliases.map((a) => a.name).sort()).toEqual(['AMZN MKTP US', 'PRIME VIDEO']);

		const tx = await conn.runAndReadAll('SELECT vendor_id FROM account_transactions WHERE id = ?', [
			't1',
		]);
		expect(tx.getRowObjects()[0].vendor_id).toBe(keep.id);
	});

	it('deletes a single alias, leaving the vendor and its other aliases', async () => {
		const conn = await createTestDb();
		const v = await createVendor(conn, 'Amazon', ['AMZN MKTP US', 'AMAZON.COM']);
		const doomed = v.aliases.find((a) => a.name === 'AMAZON.COM')!;

		await deleteVendorAlias(conn, doomed.id);

		const vendors = await listVendors(conn);
		expect(vendors).toHaveLength(1);
		expect(vendors[0].aliases.map((a) => a.name)).toEqual(['AMZN MKTP US']);
	});

	it('deleting a vendor unlinks its transactions and drops its aliases', async () => {
		const conn = await createTestDb();
		const account = await createAccount(conn, {
			name: 'CapOne',
			bank: 'capital_one',
			type: 'credit',
		});
		const vendor = await createVendor(conn, 'Amazon', ['AMZN MKTP US']);
		await conn.run(
			`INSERT INTO account_transactions
       (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				't1',
				account.id,
				'e1',
				'2026-07-01',
				'AMZN MKTP US',
				'AMZN MKTP US',
				-500,
				vendor.id,
				'unreviewed',
				'2026-07-01',
			]
		);

		await deleteVendor(conn, vendor.id);

		expect(await listVendors(conn)).toHaveLength(0);
		const aliases = await conn.runAndReadAll('SELECT id FROM vendor_aliases');
		expect(aliases.getRowObjects()).toHaveLength(0);

		const tx = await conn.runAndReadAll(
			'SELECT vendor_id, raw_vendor_name FROM account_transactions WHERE id = ?',
			['t1']
		);
		expect(tx.getRowObjects()[0].vendor_id).toBeNull();
		expect(tx.getRowObjects()[0].raw_vendor_name).toBe('AMZN MKTP US');
	});

	it('disables a rule left with no vendor criterion, but not one with vendors remaining', async () => {
		const conn = await createTestDb();
		const doomed = await createVendor(conn, 'Amazon Prime');
		const survivor = await createVendor(conn, 'Amazon');
		const catRow = await conn.runAndReadAll('SELECT id FROM budget_categories LIMIT 1');
		const catId = String(catRow.getRowObjects()[0].id);
		await conn.run(
			`INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES ('only', 'Only Prime', NULL, 'any', NULL, ?, 1, true),
              ('both', 'Either', NULL, 'any', NULL, ?, 2, true)`,
			[catId, catId]
		);
		await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?), (?, ?), (?, ?)', [
			'only',
			doomed.id,
			'both',
			doomed.id,
			'both',
			survivor.id,
		]);

		await deleteVendor(conn, doomed.id);

		const rules = await conn.runAndReadAll('SELECT id, enabled FROM rules ORDER BY priority');
		expect(rules.getRowObjects().map((r) => [String(r.id), Boolean(r.enabled)])).toEqual([
			['only', false],
			['both', true],
		]);
		const rv = await conn.runAndReadAll('SELECT rule_id, vendor_id FROM rule_vendors');
		expect(rv.getRowObjects().map((r) => String(r.vendor_id))).toEqual([survivor.id]);
	});

	it('merges vendors that share a rule without primary-key conflicts', async () => {
		const conn = await createTestDb();
		const keep = await createVendor(conn, 'Amazon');
		const remove = await createVendor(conn, 'Amazon Prime');
		const catRow = await conn.runAndReadAll('SELECT id FROM budget_categories LIMIT 1');
		const catId = String(catRow.getRowObjects()[0].id);
		const ruleId = 'rule-amazon';
		await conn.run(
			`INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES (?, 'Amazon', NULL, 'any', NULL, ?, 1, true)`,
			[ruleId, catId]
		);
		await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?), (?, ?)', [
			ruleId,
			keep.id,
			ruleId,
			remove.id,
		]);

		await mergeVendors(conn, keep.id, remove.id);

		const rv = await conn.runAndReadAll('SELECT vendor_id FROM rule_vendors WHERE rule_id = ?', [
			ruleId,
		]);
		expect(rv.getRowObjects().map((r) => String(r.vendor_id))).toEqual([keep.id]);
	});
});
