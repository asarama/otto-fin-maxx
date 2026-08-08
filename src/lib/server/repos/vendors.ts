import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

export interface VendorAlias {
	id: string;
	name: string;
}

export interface Vendor {
	id: string;
	name: string;
	aliases: VendorAlias[];
}

export async function listVendors(conn: DuckDBConnection): Promise<Vendor[]> {
	const reader = await conn.runAndReadAll(
		`SELECT v.id, v.name, va.id AS alias_id, va.name AS alias
     FROM vendors v
     LEFT JOIN vendor_aliases va ON va.vendor_id = v.id
     ORDER BY v.name, va.name`
	);
	const byId = new Map<string, Vendor>();
	for (const row of reader.getRowObjects()) {
		const id = String(row.id);
		if (!byId.has(id)) {
			byId.set(id, { id, name: String(row.name), aliases: [] });
		}
		if (row.alias !== null && row.alias !== undefined) {
			byId.get(id)!.aliases.push({ id: String(row.alias_id), name: String(row.alias) });
		}
	}
	return [...byId.values()];
}

export async function createVendor(
	conn: DuckDBConnection,
	name: string,
	aliases: string[] = []
): Promise<Vendor> {
	const id = randomUUID();
	await conn.run('INSERT INTO vendors (id, name, created_at) VALUES (?, ?, ?)', [
		id,
		name,
		new Date().toISOString(),
	]);
	const created: VendorAlias[] = [];
	for (const alias of aliases) {
		const aliasId = randomUUID();
		await conn.run(
			'INSERT INTO vendor_aliases (id, vendor_id, name, created_at) VALUES (?, ?, ?, ?)',
			[aliasId, id, alias, new Date().toISOString()]
		);
		created.push({ id: aliasId, name: alias });
	}
	return { id, name, aliases: created };
}

export async function addVendorAlias(
	conn: DuckDBConnection,
	vendorId: string,
	name: string
): Promise<void> {
	await conn.run(
		'INSERT INTO vendor_aliases (id, vendor_id, name, created_at) VALUES (?, ?, ?, ?)',
		[randomUUID(), vendorId, name, new Date().toISOString()]
	);
}

export async function deleteVendorAlias(conn: DuckDBConnection, aliasId: string): Promise<void> {
	await conn.run('DELETE FROM vendor_aliases WHERE id = ?', [aliasId]);
}

export async function deleteVendor(conn: DuckDBConnection, id: string): Promise<void> {
	await conn.run(
		`UPDATE rules SET enabled = false WHERE id IN (
       SELECT rule_id FROM rule_vendors WHERE vendor_id = ?
       EXCEPT
       SELECT rule_id FROM rule_vendors WHERE vendor_id <> ?
     )`,
		[id, id]
	);
	await conn.run('UPDATE account_transactions SET vendor_id = NULL WHERE vendor_id = ?', [id]);
	await conn.run('DELETE FROM rule_vendors WHERE vendor_id = ?', [id]);
	await conn.run('DELETE FROM vendor_aliases WHERE vendor_id = ?', [id]);
	await conn.run('DELETE FROM vendors WHERE id = ?', [id]);
}

export async function mergeVendors(
	conn: DuckDBConnection,
	keepId: string,
	removeId: string
): Promise<void> {
	await conn.run(
		`DELETE FROM rule_vendors WHERE vendor_id = ? AND rule_id IN (
       SELECT rule_id FROM rule_vendors WHERE vendor_id = ?
     )`,
		[removeId, keepId]
	);
	await conn.run('UPDATE vendor_aliases SET vendor_id = ? WHERE vendor_id = ?', [keepId, removeId]);
	await conn.run('UPDATE account_transactions SET vendor_id = ? WHERE vendor_id = ?', [
		keepId,
		removeId,
	]);
	await conn.run('UPDATE rule_vendors SET vendor_id = ? WHERE vendor_id = ?', [keepId, removeId]);
	await conn.run(
		`DELETE FROM vendor_aliases WHERE id IN (
       SELECT a.id FROM vendor_aliases a
       JOIN vendor_aliases b ON a.vendor_id = b.vendor_id
         AND lower(a.name) = lower(b.name) AND a.id > b.id
     )`
	);
	await conn.run('DELETE FROM vendors WHERE id = ?', [removeId]);
}
