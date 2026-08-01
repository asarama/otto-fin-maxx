import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

export interface Account {
	id: string;
	name: string;
	bank: string;
	type: string;
	currency: string;
	created_at: string;
}

const BANKS = ['capital_one', 'bmo'];
const TYPES = ['credit', 'debit'];

function rowToAccount(row: Record<string, unknown>): Account {
	return {
		id: String(row.id),
		name: String(row.name),
		bank: String(row.bank),
		type: String(row.type),
		currency: String(row.currency),
		created_at: String(row.created_at),
	};
}

export async function listAccounts(conn: DuckDBConnection): Promise<Account[]> {
	const reader = await conn.runAndReadAll('SELECT * FROM accounts ORDER BY created_at');
	return reader.getRowObjects().map(rowToAccount);
}

export async function getAccount(conn: DuckDBConnection, id: string): Promise<Account | null> {
	const reader = await conn.runAndReadAll('SELECT * FROM accounts WHERE id = ?', [id]);
	const rows = reader.getRowObjects();
	return rows.length > 0 ? rowToAccount(rows[0]) : null;
}

export async function createAccount(
	conn: DuckDBConnection,
	input: { name: string; bank: string; type: string }
): Promise<Account> {
	if (!BANKS.includes(input.bank)) throw new Error(`Invalid bank: ${input.bank}`);
	if (!TYPES.includes(input.type)) throw new Error(`Invalid type: ${input.type}`);
	const id = randomUUID();
	await conn.run(
		'INSERT INTO accounts (id, name, bank, type, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)',
		[id, input.name, input.bank, input.type, 'USD', new Date().toISOString()]
	);
	const created = await getAccount(conn, id);
	if (!created) throw new Error('Account creation failed');
	return created;
}

export async function renameAccount(
	conn: DuckDBConnection,
	id: string,
	name: string
): Promise<void> {
	await conn.run('UPDATE accounts SET name = ? WHERE id = ?', [name, id]);
}
