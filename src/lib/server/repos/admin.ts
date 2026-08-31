import type { DuckDBConnection } from '@duckdb/node-api';

export interface TableCount {
	table: string;
	count: number;
}

const TABLES = [
	'account_transactions',
	'rule_vendors',
	'vendor_aliases',
	'budget_category_months',
	'rules',
	'budget_categories',
	'accounts',
	'vendors',
	'budgets',
	'owners',
];

export async function tableCounts(conn: DuckDBConnection): Promise<TableCount[]> {
	const counts: TableCount[] = [];
	for (const table of TABLES) {
		const res = await conn.runAndReadAll(`SELECT count(*) AS n FROM ${table}`);
		counts.push({ table, count: Number(res.getRowObjects()[0].n) });
	}
	return counts;
}

export async function truncateAll(conn: DuckDBConnection): Promise<TableCount[]> {
	for (const table of TABLES) {
		await conn.run(`DELETE FROM ${table}`);
	}
	return tableCounts(conn);
}
