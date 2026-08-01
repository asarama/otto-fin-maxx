import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';
import { externalId } from '$lib/externalId';
import type { ParsedRow } from '$lib/parsers';
import { resolveVendor } from '$lib/matchers/vendors';
import { firstMatchingRule } from '$lib/matchers/rules';
import { listVendors } from './repos/vendors';
import { listRules } from './repos/rules';
import { ensureBudgetCategoryMonth } from './repos/budgets';

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
  categorized: number;
}

export async function importTransactions(conn: DuckDBConnection, accountId: string, rows: ParsedRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, duplicates: 0, errors: [], categorized: 0 };
  const vendors = await listVendors(conn);

  for (const row of rows) {
    const id = externalId(accountId, row.postedDate, row.description, row.rawVendorName, row.amountCents);
    const exists = await conn.runAndReadAll('SELECT id FROM account_transactions WHERE external_id = ?', [id]);
    if (exists.getRowObjects().length > 0) {
      result.duplicates++;
      continue;
    }
    try {
      const vendorId = resolveVendor(row.rawVendorName, vendors);
      await conn.run(
        `INSERT INTO account_transactions
         (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?)`,
        [randomUUID(), accountId, id, row.postedDate, row.description, row.rawVendorName, row.amountCents, vendorId, new Date().toISOString()]
      );
      result.imported++;
    } catch (err) {
      result.errors.push(`Row "${row.description}" (${row.postedDate}): ${(err as Error).message}`);
    }
  }

  result.categorized = await categorizeUnreviewed(conn);
  return result;
}

export async function categorizeUnreviewed(conn: DuckDBConnection): Promise<number> {
  const rules = (await listRules(conn)).filter((r) => r.enabled);
  const candidates = await conn.runAndReadAll(
    `SELECT id, posted_date, description, amount_cents, vendor_id
     FROM account_transactions WHERE assignment_status = 'unreviewed'`
  );
  let categorized = 0;
  for (const row of candidates.getRowObjects()) {
    const match = firstMatchingRule(rules, {
      description: String(row.description),
      vendorId: row.vendor_id === null ? null : String(row.vendor_id),
      amountCents: Number(row.amount_cents)
    });
    if (!match) continue;
    const month = String(row.posted_date).slice(0, 7);
    const bcm = await ensureBudgetCategoryMonth(conn, match.budgetCategoryId, month);
    await conn.run(
      'UPDATE account_transactions SET budget_category_month_id = ?, assignment_status = ? WHERE id = ?',
      [bcm.id, 'auto', String(row.id)]
    );
    categorized++;
  }
  return categorized;
}
