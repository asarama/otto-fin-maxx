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
}

export interface TransactionFilters {
	accountId?: string;
	month?: string;
	status?: string;
	search?: string;
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
		'UPDATE account_transactions SET budget_category_month_id = ?, assignment_status = ? WHERE id = ?',
		[budgetCategoryMonthId, 'manual', txId]
	);
}
