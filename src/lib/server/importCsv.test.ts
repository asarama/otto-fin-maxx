import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-helpers';
import { createAccount } from './repos/accounts';
import { createVendor } from './repos/vendors';
import { listOwners, createBudget, createBudgetCategory } from './repos/budgets';
import { listTransactions, countUnreviewed } from './repos/transactions';
import { listRules } from './repos/rules';
import { importTransactions, categorizeUnreviewed } from './importCsv';
import type { ParsedRow } from '$lib/parsers';

const rows: ParsedRow[] = [
  { postedDate: '2026-07-01', description: 'AMZN MKTP US', rawVendorName: 'AMZN MKTP US', amountCents: -4567 },
  { postedDate: '2026-07-02', description: 'SHELL OIL', rawVendorName: 'SHELL OIL', amountCents: -3890 }
];

describe('importTransactions', () => {
  it('inserts, dedupes, and resolves vendors', async () => {
    const conn = await createTestDb();
    const account = await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
    await createVendor(conn, 'Amazon', ['AMZN MKTP US']);

    const first = await importTransactions(conn, account.id, rows);
    expect(first.imported).toBe(2);
    expect(first.duplicates).toBe(0);

    const second = await importTransactions(conn, account.id, rows);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(2);

    const txs = await listTransactions(conn, {});
    expect(txs).toHaveLength(2);
    expect(txs.find((t) => t.description === 'AMZN MKTP US')?.vendorId).not.toBeNull();
  });
});

describe('categorizeUnreviewed', () => {
  it('assigns matching transactions by rule priority', async () => {
    const conn = await createTestDb();
    const account = await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const gaming = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
    const general = await createBudgetCategory(conn, { budgetId: budget.id, name: 'General', monthlyLimitCents: 0 });

    await conn.run(
      `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES (?, 'Shell', '^SHELL', 'any', NULL, ?, 1, true), (?, 'Amazon', '^AMZN', 'any', NULL, ?, 2, true)`,
      ['rule-shell', general.id, 'rule-amazon', gaming.id]
    );

    await importTransactions(conn, account.id, rows);
    expect(await countUnreviewed(conn)).toBe(0);

    const txs = await listTransactions(conn, {});
    const amzn = txs.find((t) => t.description === 'AMZN MKTP US')!;
    const shell = txs.find((t) => t.description === 'SHELL OIL')!;

    const assigned = await conn.runAndReadAll(
      `SELECT bcm.budget_category_id FROM account_transactions t
       JOIN budget_category_months bcm ON bcm.id = t.budget_category_month_id
       WHERE t.id IN (?, ?)`,
      [amzn.id, shell.id]
    );
    const categoryIds = assigned.getRowObjects().map((r) => String(r.budget_category_id)).sort();
    expect(categoryIds).toEqual([gaming.id, general.id].sort());
  });

  it('never overwrites auto or manual assignments', async () => {
    const conn = await createTestDb();
    const account = await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const gaming = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
    await conn.run(
      `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES (?, 'Amazon', '^AMZN', 'any', NULL, ?, 1, true)`,
      ['rule-amazon', gaming.id]
    );

    await importTransactions(conn, account.id, rows);
    expect(await countUnreviewed(conn)).toBe(1);

    const before = (await listTransactions(conn, {})).find((t) => t.description === 'AMZN MKTP US')!;
    expect(before.assignmentStatus).toBe('auto');

    await categorizeUnreviewed(conn);
    const after = (await listTransactions(conn, {})).find((t) => t.description === 'AMZN MKTP US')!;
    expect(after.assignmentStatus).toBe('auto');
  });
});

describe('listRules round-trip', () => {
  it('returns vendorIds with rules', async () => {
    const conn = await createTestDb();
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const gaming = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
    const amazon = await createVendor(conn, 'Amazon', ['AMZN MKTP US']);
    await conn.run(
      `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES (?, 'Amazon', '^AMZN', 'any', NULL, ?, 1, true)`,
      ['rule-amazon', gaming.id]
    );
    await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?)', ['rule-amazon', amazon.id]);
    const rules = await listRules(conn);
    expect(rules[0].vendorIds).toEqual([amazon.id]);
  });
});
