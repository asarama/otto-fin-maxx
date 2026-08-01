import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { SCHEMA_SQL } from './schema';
import { seedDefaults } from './seed';

export async function createTestDb(): Promise<DuckDBConnection> {
	const instance = await DuckDBInstance.create(':memory:');
	const conn = await instance.connect();
	await conn.run(SCHEMA_SQL);
	await seedDefaults(conn);
	return conn;
}
