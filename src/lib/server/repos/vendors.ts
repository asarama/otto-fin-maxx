import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

export interface Vendor {
  id: string;
  name: string;
  aliases: string[];
}

export async function listVendors(conn: DuckDBConnection): Promise<Vendor[]> {
  const reader = await conn.runAndReadAll(
    `SELECT v.id, v.name, va.name AS alias
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
      byId.get(id)!.aliases.push(String(row.alias));
    }
  }
  return [...byId.values()];
}

export async function createVendor(conn: DuckDBConnection, name: string, aliases: string[] = []): Promise<Vendor> {
  const id = randomUUID();
  await conn.run('INSERT INTO vendors (id, name, created_at) VALUES (?, ?, ?)', [id, name, new Date().toISOString()]);
  for (const alias of aliases) {
    await conn.run(
      'INSERT INTO vendor_aliases (id, vendor_id, name, created_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), id, alias, new Date().toISOString()]
    );
  }
  return { id, name, aliases: [...aliases] };
}

export async function addVendorAlias(conn: DuckDBConnection, vendorId: string, name: string): Promise<void> {
  await conn.run(
    'INSERT INTO vendor_aliases (id, vendor_id, name, created_at) VALUES (?, ?, ?, ?)',
    [randomUUID(), vendorId, name, new Date().toISOString()]
  );
}

export async function mergeVendors(conn: DuckDBConnection, keepId: string, removeId: string): Promise<void> {
  await conn.run(
    `DELETE FROM rule_vendors WHERE vendor_id = ? AND rule_id IN (
       SELECT rule_id FROM rule_vendors WHERE vendor_id = ?
     )`,
    [removeId, keepId]
  );
  await conn.run('UPDATE vendor_aliases SET vendor_id = ? WHERE vendor_id = ?', [keepId, removeId]);
  await conn.run('UPDATE account_transactions SET vendor_id = ? WHERE vendor_id = ?', [keepId, removeId]);
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
