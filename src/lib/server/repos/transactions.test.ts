import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { createAccount } from './accounts';
import { createVendor } from './vendors';
import { listOwners, createBudget, createBudgetCategory, ensureBudgetCategoryMonth } from './budgets';
import { listTransactions, countUnreviewed, getUnreviewed, assignTransaction } from './transactions';

async function seedTx(conn: Awaited<ReturnType<typeof createTestDb>>, overrides: Record<string, unknown> = {}) {
  const account = overrides.accountId
    ? { id: String(overrides.accountId) }
    : await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
  const vendor = await createVendor(conn, 'Amazon');
  await conn.run(
    `INSERT INTO account_transactions
     (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      overrides.id ?? 'tx1', account.id, overrides.externalId ?? 'e1', overrides.postedDate ?? '2026-07-01',
      overrides.description ?? 'AMZN MKTP US', overrides.rawVendorName ?? 'AMZN MKTP US',
      overrides.amountCents ?? -500, vendor.id, overrides.status ?? 'unreviewed', '2026-07-01'
    ]
  );
  return { account, vendor };
}

describe('transactions repo', () => {
  it('lists transactions and applies filters', async () => {
    const conn = await createTestDb();
    const { account } = await seedTx(conn);
    await seedTx(conn, { id: 'tx2', externalId: 'e2', postedDate: '2026-06-15', description: 'RENT', status: 'auto', accountId: account.id });

    const all = await listTransactions(conn, {});
    expect(all).toHaveLength(2);
    const july = await listTransactions(conn, { month: '2026-07' });
    expect(july).toHaveLength(1);
    expect(july[0].id).toBe('tx1');
    const byAccount = await listTransactions(conn, { accountId: account.id });
    expect(byAccount).toHaveLength(2);
    const search = await listTransactions(conn, { search: 'rent' });
    expect(search).toHaveLength(1);
    expect(search[0].id).toBe('tx2');
  });

  it('counts and lists unreviewed transactions', async () => {
    const conn = await createTestDb();
    await seedTx(conn);
    await seedTx(conn, { id: 'tx2', externalId: 'e2', status: 'auto' });
    expect(await countUnreviewed(conn)).toBe(1);
    const unreviewed = await getUnreviewed(conn);
    expect(unreviewed.map((t) => t.id)).toEqual(['tx1']);
  });

  it('assigns a transaction to a budget category month', async () => {
    const conn = await createTestDb();
    await seedTx(conn);
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const cat = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
    const month = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');

    await assignTransaction(conn, 'tx1', month.id);
    const txs = await listTransactions(conn, {});
    expect(txs[0].budgetCategoryMonthId).toBe(month.id);
    expect(txs[0].assignmentStatus).toBe('manual');
  });
});
