import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api';

export interface Transaction {
	id: string;
	accountId: string;
	externalId: string;
	postedDate: string;
	description: string;
	rawVendorName: string | null;
	amountCents: number;
	vendorId: string | null;
	budgetCategoryMonthId: string | null;
	assignmentStatus: string;
	ignored: boolean;
}

export interface TransactionFilters {
	accountId?: string;
	month?: string;
	status?: string;
	search?: string;
	ignored?: boolean;
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
	return {
		id: String(row.id),
		accountId: String(row.account_id),
		externalId: String(row.external_id),
		postedDate: String(row.posted_date),
		description: String(row.description),
		rawVendorName: row.raw_vendor_name === null ? null : String(row.raw_vendor_name),
		amountCents: Number(row.amount_cents),
		vendorId: row.vendor_id === null ? null : String(row.vendor_id),
		budgetCategoryMonthId:
			row.budget_category_month_id === null ? null : String(row.budget_category_month_id),
		assignmentStatus: String(row.assignment_status),
		ignored: Boolean(row.ignored),
	};
}

export async function listTransactions(
	conn: DuckDBConnection,
	filters: TransactionFilters
): Promise<Transaction[]> {
	const where: string[] = [];
	const params: DuckDBValue[] = [];
	if (filters.accountId) {
		where.push('account_id = ?');
		params.push(filters.accountId);
	}
	if (filters.month) {
		where.push('substr(posted_date, 1, 7) = ?');
		params.push(filters.month);
	}
	if (filters.status) {
		where.push('assignment_status = ?');
		params.push(filters.status);
	}
	if (filters.ignored === true) {
		where.push('ignored = true');
	} else if (filters.ignored === false) {
		where.push('ignored IS NOT TRUE');
	}
	if (filters.search) {
		where.push('lower(description) LIKE lower(?)');
		params.push(`%${filters.search}%`);
	}
	const sql = `SELECT * FROM account_transactions
               ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY posted_date DESC`;
	const reader = await conn.runAndReadAll(sql, params);
	return reader.getRowObjects().map(rowToTransaction);
}

export async function countUnreviewed(conn: DuckDBConnection): Promise<number> {
	const reader = await conn.runAndReadAll(
		`SELECT count(*) AS n FROM account_transactions WHERE assignment_status = 'unreviewed'`
	);
	return Number(reader.getRowObjects()[0].n);
}

export async function getUnreviewed(conn: DuckDBConnection): Promise<Transaction[]> {
	return listTransactions(conn, { status: 'unreviewed' });
}

export async function assignTransaction(
	conn: DuckDBConnection,
	txId: string,
	budgetCategoryMonthId: string
): Promise<void> {
	await conn.run(
		'UPDATE account_transactions SET budget_category_month_id = ?, assignment_status = ?, ignored = false WHERE id = ?',
		[budgetCategoryMonthId, 'manual', txId]
	);
}

export async function ignoreTransactions(conn: DuckDBConnection, txIds: string[]): Promise<void> {
	if (txIds.length === 0) return;
	const placeholders = txIds.map(() => '?').join(', ');
	await conn.run(
		`UPDATE account_transactions
     SET ignored = true, assignment_status = 'manual', budget_category_month_id = NULL
     WHERE id IN (${placeholders})`,
		txIds
	);
}

export async function unignoreTransaction(conn: DuckDBConnection, txId: string): Promise<void> {
	await conn.run(
		`UPDATE account_transactions
     SET ignored = false, assignment_status = 'unreviewed', budget_category_month_id = NULL
     WHERE id = ?`,
		[txId]
	);
}
