import { getDb } from '../src/lib/server/db';
import { listOwners, createBudget, createBudgetCategory } from '../src/lib/server/repos/budgets';
import { createVendor } from '../src/lib/server/repos/vendors';
import { createAccount } from '../src/lib/server/repos/accounts';
import { importTransactions } from '../src/lib/server/importCsv';

const conn = await getDb();

async function ensureAccount(name: string, bank: string, type: string) {
	const existing = await conn.runAndReadAll('SELECT id, name FROM accounts WHERE name = ?', [name]);
	const rows = existing.getRowObjects();
	return rows.length > 0
		? { id: String(rows[0].id), name }
		: createAccount(conn, { name, bank, type });
}

async function ensureBudget(ownerId: string, name: string) {
	const existing = await conn.runAndReadAll(
		'SELECT id FROM budgets WHERE owner_id = ? AND name = ?',
		[ownerId, name]
	);
	const rows = existing.getRowObjects();
	return rows.length > 0 ? { id: String(rows[0].id) } : createBudget(conn, { ownerId, name });
}

async function ensureCategory(budgetId: string, name: string, monthlyLimitCents: number) {
	const existing = await conn.runAndReadAll(
		'SELECT id FROM budget_categories WHERE budget_id = ? AND name = ?',
		[budgetId, name]
	);
	const rows = existing.getRowObjects();
	return rows.length > 0
		? { id: String(rows[0].id) }
		: createBudgetCategory(conn, { budgetId, name, monthlyLimitCents });
}

async function ensureVendor(name: string, aliases: string[]) {
	const existing = await conn.runAndReadAll('SELECT id FROM vendors WHERE name = ?', [name]);
	const rows = existing.getRowObjects();
	return rows.length > 0 ? { id: String(rows[0].id) } : createVendor(conn, name, aliases);
}

const capone = await ensureAccount('Capital One Quicksilver', 'capital_one', 'credit');
const bmo = await ensureAccount('BMO Checking', 'bmo', 'debit');

const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
const family = (await listOwners(conn)).find((o) => o.name === 'Family')!;
const personal = await ensureBudget(me.id, 'Personal');
const familyBudget = await ensureBudget(family.id, 'Household');
const gaming = await ensureCategory(personal.id, 'Gaming', 10000);
const groceries = await ensureCategory(familyBudget.id, 'Groceries', 60000);

const amazon = await ensureVendor('Amazon', ['AMZN MKTP US']);
const shell = await ensureVendor('Shell', ['SHELL OIL']);

await conn.run(
	`INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
   VALUES (?, 'Amazon', '^AMZN', 'any', NULL, ?, 1, true), (?, 'Shell', 'SHELL', 'any', NULL, ?, 2, true)
   ON CONFLICT (id) DO NOTHING`,
	['r-amazon', gaming.id, 'r-shell', groceries.id]
);
await conn.run(
	'INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?), (?, ?) ON CONFLICT (rule_id, vendor_id) DO NOTHING',
	['r-amazon', amazon.id, 'r-shell', shell.id]
);

const txns = [
	{
		postedDate: '2026-07-01',
		description: 'AMZN MKTP US',
		rawVendorName: 'AMZN MKTP US',
		amountCents: -4567,
	},
	{
		postedDate: '2026-07-02',
		description: 'SHELL OIL',
		rawVendorName: 'SHELL OIL',
		amountCents: -3890,
	},
	{
		postedDate: '2026-07-03',
		description: 'TRADER JOES #123',
		rawVendorName: 'TRADER JOES #123',
		amountCents: -12000,
	},
	{
		postedDate: '2026-07-04',
		description: 'STEAM PURCHASE',
		rawVendorName: 'STEAM PURCHASE',
		amountCents: -2999,
	},
];
await importTransactions(conn, capone.id, txns.slice(0, 3));
await importTransactions(conn, bmo.id, txns.slice(3));

console.log('Sample data seeded.');
console.log('Accounts:', capone.name, 'and', bmo.name);
console.log('Categories: Gaming, Groceries');
