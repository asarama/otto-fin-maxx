import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

export function quackUri(): string {
	const host = process.env.QUACK_HOST ?? '127.0.0.1';
	const port = process.env.QUACK_PORT ?? '9494';
	return `quack:${host}:${port}`;
}

export async function attachDb(): Promise<DuckDBConnection> {
	const token = process.env.QUACK_TOKEN ?? 'local-dev';
	const instance = await DuckDBInstance.create(':memory:');
	const conn = await instance.connect();
	await conn.run('INSTALL quack');
	await conn.run('LOAD quack');
	await conn.run(`ATTACH '${quackUri()}' AS fin (TOKEN '${token}')`);
	await conn.run('USE fin');
	return conn;
}
