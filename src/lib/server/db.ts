import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { SCHEMA_SQL } from './schema';
import { seedDefaults } from './seed';

const g = globalThis as unknown as { __financeDbConnection?: DuckDBConnection };

export function getDbPath(): string {
	return process.env.FINANCE_DB_PATH ?? 'data/finance.db';
}

export async function getDb(): Promise<DuckDBConnection> {
	if (g.__financeDbConnection) return g.__financeDbConnection;
	const path = getDbPath();
	mkdirSync(dirname(path), { recursive: true });
	const instance = await DuckDBInstance.create(path);
	const conn = await instance.connect();
	await conn.run(SCHEMA_SQL);
	await seedDefaults(conn);
	g.__financeDbConnection = conn;
	return conn;
}
