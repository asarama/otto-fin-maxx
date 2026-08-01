import { randomUUID } from 'node:crypto';
import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api';
import type { AmountOperator } from '$lib/matchers/rules';

export interface Rule {
  id: string;
  name: string;
  descriptionMatcher: string | null;
  amountOperator: AmountOperator;
  amountCents: number | null;
  budgetCategoryId: string;
  priority: number;
  enabled: boolean;
  vendorIds: string[];
}

export interface CreateRuleInput {
  name: string;
  descriptionMatcher?: string | null;
  amountOperator?: AmountOperator;
  amountCents?: number | null;
  budgetCategoryId: string;
  priority?: number;
  vendorIds?: string[];
}

export async function listRules(conn: DuckDBConnection): Promise<Rule[]> {
  const rules = await conn.runAndReadAll(
    `SELECT r.*, rv.vendor_id AS vendor_id
     FROM rules r
     LEFT JOIN rule_vendors rv ON rv.rule_id = r.id
     ORDER BY r.priority, r.name`
  );
  const byId = new Map<string, Rule>();
  for (const row of rules.getRowObjects()) {
    const id = String(row.id);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: String(row.name),
        descriptionMatcher: row.description_matcher === null ? null : String(row.description_matcher),
        amountOperator: row.amount_operator as AmountOperator,
        amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
        budgetCategoryId: String(row.budget_category_id),
        priority: Number(row.priority),
        enabled: Boolean(row.enabled),
        vendorIds: []
      });
    }
    if (row.vendor_id !== null && row.vendor_id !== undefined) {
      byId.get(id)!.vendorIds.push(String(row.vendor_id));
    }
  }
  return [...byId.values()];
}

export async function createRule(conn: DuckDBConnection, input: CreateRuleInput): Promise<Rule> {
  const id = randomUUID();
  const priority = input.priority ?? (await nextPriority(conn));
  await conn.run(
    `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, true)`,
    [id, input.name, input.descriptionMatcher ?? null, input.amountOperator ?? 'any', input.amountCents ?? null, input.budgetCategoryId, priority]
  );
  for (const vendorId of input.vendorIds ?? []) {
    await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?)', [id, vendorId]);
  }
  const rules = await listRules(conn);
  return rules.find((r) => r.id === id)!;
}

export async function updateRule(conn: DuckDBConnection, id: string, patch: Partial<Rule>): Promise<void> {
  const sets: string[] = [];
  const params: DuckDBValue[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if (patch.descriptionMatcher !== undefined) { sets.push('description_matcher = ?'); params.push(patch.descriptionMatcher); }
  if (patch.amountOperator !== undefined) { sets.push('amount_operator = ?'); params.push(patch.amountOperator); }
  if (patch.amountCents !== undefined) { sets.push('amount_cents = ?'); params.push(patch.amountCents); }
  if (patch.budgetCategoryId !== undefined) { sets.push('budget_category_id = ?'); params.push(patch.budgetCategoryId); }
  if (patch.priority !== undefined) { sets.push('priority = ?'); params.push(patch.priority); }
  if (patch.enabled !== undefined) { sets.push('enabled = ?'); params.push(patch.enabled); }
  if (sets.length > 0) {
    params.push(id);
    await conn.run(`UPDATE rules SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  if (patch.vendorIds !== undefined) {
    await conn.run('DELETE FROM rule_vendors WHERE rule_id = ?', [id]);
    for (const vendorId of patch.vendorIds) {
      await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?)', [id, vendorId]);
    }
  }
}

export async function deleteRule(conn: DuckDBConnection, id: string): Promise<void> {
  await conn.run('DELETE FROM rule_vendors WHERE rule_id = ?', [id]);
  await conn.run('DELETE FROM rules WHERE id = ?', [id]);
}

export async function moveRule(conn: DuckDBConnection, id: string, direction: 'up' | 'down'): Promise<void> {
  const current = await conn.runAndReadAll('SELECT id, priority FROM rules WHERE id = ?', [id]);
  const rows = current.getRowObjects();
  if (rows.length === 0) throw new Error(`Rule not found: ${id}`);
  const fromId = String(rows[0].id);
  const from = Number(rows[0].priority);

  const neighbor = direction === 'up'
    ? await conn.runAndReadAll('SELECT id, priority FROM rules WHERE priority < ? ORDER BY priority DESC LIMIT 1', [from])
    : await conn.runAndReadAll('SELECT id, priority FROM rules WHERE priority > ? ORDER BY priority ASC LIMIT 1', [from]);
  const nrows = neighbor.getRowObjects();
  if (nrows.length === 0) return;
  const toId = String(nrows[0].id);
  const to = Number(nrows[0].priority);

  await conn.run('UPDATE rules SET priority = ? WHERE id = ?', [to, fromId]);
  await conn.run('UPDATE rules SET priority = ? WHERE id = ?', [from, toId]);
}

async function nextPriority(conn: DuckDBConnection): Promise<number> {
  const reader = await conn.runAndReadAll('SELECT coalesce(max(priority), -1) + 1 AS next FROM rules');
  return Number(reader.getRowObjects()[0].next);
}
