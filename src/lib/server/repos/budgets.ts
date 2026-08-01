import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

export interface Owner {
  id: string;
  name: string;
}

export interface Budget {
  id: string;
  name: string;
  owner_id: string;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  name: string;
  monthly_limit_cents: number;
}

export interface BudgetCategoryMonth {
  id: string;
  budget_category_id: string;
  month: string;
  amount_cents: number;
}

export async function listOwners(conn: DuckDBConnection): Promise<Owner[]> {
  const reader = await conn.runAndReadAll('SELECT id, name FROM owners ORDER BY name');
  return reader.getRowObjects().map((r) => ({ id: String(r.id), name: String(r.name) }));
}

export async function listBudgets(conn: DuckDBConnection): Promise<Budget[]> {
  const reader = await conn.runAndReadAll('SELECT id, name, owner_id FROM budgets ORDER BY name');
  return reader.getRowObjects().map((r) => ({ id: String(r.id), name: String(r.name), owner_id: String(r.owner_id) }));
}

export async function createBudget(conn: DuckDBConnection, input: { ownerId: string; name: string }): Promise<Budget> {
  const id = randomUUID();
  await conn.run(
    'INSERT INTO budgets (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)',
    [id, input.ownerId, input.name, new Date().toISOString()]
  );
  return { id, name: input.name, owner_id: input.ownerId };
}

export async function listBudgetCategories(conn: DuckDBConnection): Promise<BudgetCategory[]> {
  const reader = await conn.runAndReadAll(
    'SELECT id, budget_id, name, monthly_limit_cents FROM budget_categories ORDER BY name'
  );
  return reader.getRowObjects().map((r) => ({
    id: String(r.id),
    budget_id: String(r.budget_id),
    name: String(r.name),
    monthly_limit_cents: Number(r.monthly_limit_cents)
  }));
}

export async function createBudgetCategory(
  conn: DuckDBConnection,
  input: { budgetId: string; name: string; monthlyLimitCents: number }
): Promise<BudgetCategory> {
  const id = randomUUID();
  await conn.run(
    'INSERT INTO budget_categories (id, budget_id, name, monthly_limit_cents, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, input.budgetId, input.name, input.monthlyLimitCents, new Date().toISOString()]
  );
  return { id, budget_id: input.budgetId, name: input.name, monthly_limit_cents: input.monthlyLimitCents };
}

export async function updateBudgetCategoryLimit(conn: DuckDBConnection, id: string, monthlyLimitCents: number): Promise<void> {
  const current = await ensureBudgetCategoryMonth(conn, id, currentMonth());
  await conn.run('UPDATE budget_categories SET monthly_limit_cents = ? WHERE id = ?', [monthlyLimitCents, id]);
  await conn.run('UPDATE budget_category_months SET amount_cents = ? WHERE id = ?', [monthlyLimitCents, current.id]);
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function ensureBudgetCategoryMonth(
  conn: DuckDBConnection,
  budgetCategoryId: string,
  month: string
): Promise<BudgetCategoryMonth> {
  const existing = await conn.runAndReadAll(
    'SELECT id, budget_category_id, month, amount_cents FROM budget_category_months WHERE budget_category_id = ? AND month = ?',
    [budgetCategoryId, month]
  );
  const rows = existing.getRowObjects();
  if (rows.length > 0) {
    return {
      id: String(rows[0].id),
      budget_category_id: String(rows[0].budget_category_id),
      month: String(rows[0].month),
      amount_cents: Number(rows[0].amount_cents)
    };
  }
  const limit = await conn.runAndReadAll('SELECT monthly_limit_cents FROM budget_categories WHERE id = ?', [budgetCategoryId]);
  const amountCents = limit.getRowObjects().length > 0 ? Number(limit.getRowObjects()[0].monthly_limit_cents) : 0;
  const id = randomUUID();
  await conn.run(
    'INSERT INTO budget_category_months (id, budget_category_id, month, amount_cents) VALUES (?, ?, ?, ?)',
    [id, budgetCategoryId, month, amountCents]
  );
  return { id, budget_category_id: budgetCategoryId, month, amount_cents: amountCents };
}

export async function listBudgetCategoryMonths(conn: DuckDBConnection, month: string): Promise<BudgetCategoryMonth[]> {
  const reader = await conn.runAndReadAll(
    'SELECT id, budget_category_id, month, amount_cents FROM budget_category_months WHERE month = ? ORDER BY amount_cents',
    [month]
  );
  return reader.getRowObjects().map((r) => ({
    id: String(r.id),
    budget_category_id: String(r.budget_category_id),
    month: String(r.month),
    amount_cents: Number(r.amount_cents)
  }));
}
