import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import {
  listOwners, listBudgets, createBudget, listBudgetCategories,
  createBudgetCategory, updateBudgetCategoryLimit,
  ensureBudgetCategoryMonth, listBudgetCategoryMonths
} from './budgets';

describe('budgets repo', () => {
  it('lists seeded owners', async () => {
    const conn = await createTestDb();
    const owners = await listOwners(conn);
    expect(owners.map((o) => o.name)).toEqual(['Family', 'Me', 'Wife']);
  });

  it('creates a budget and category under an owner', async () => {
    const conn = await createTestDb();
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const cat = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });

    const budgets = await listBudgets(conn);
    expect(budgets.some((b) => b.id === budget.id && b.owner_id === me.id)).toBe(true);

    const cats = await listBudgetCategories(conn);
    expect(cats.some((c) => c.id === cat.id && c.monthly_limit_cents === 10000)).toBe(true);

    await updateBudgetCategoryLimit(conn, cat.id, 15000);
    const updated = (await listBudgetCategories(conn)).find((c) => c.id === cat.id)!;
    expect(updated.monthly_limit_cents).toBe(15000);
  });

  it('ensures a month snapshot with the current limit', async () => {
    const conn = await createTestDb();
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const cat = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });

    const m1 = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
    const m2 = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
    expect(m1.id).toBe(m2.id);
    expect(m1.amount_cents).toBe(10000);

    const all = await listBudgetCategoryMonths(conn, '2026-07');
    expect(all).toHaveLength(1);
    expect(all[0].amount_cents).toBe(10000);
  });

  it('updating a limit preserves past snapshots and applies to future months', async () => {
    const conn = await createTestDb();
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const cat = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });

    await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
    await updateBudgetCategoryLimit(conn, cat.id, 15000);

    const july = await listBudgetCategoryMonths(conn, '2026-07');
    expect(july[0].amount_cents).toBe(10000);

    const august = await ensureBudgetCategoryMonth(conn, cat.id, '2026-08');
    expect(august.amount_cents).toBe(15000);
  });
});
