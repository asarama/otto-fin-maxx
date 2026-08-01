import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { listAccounts, createAccount, renameAccount, getAccount } from './accounts';

describe('accounts repo', () => {
  it('creates, lists, renames, and fetches accounts', async () => {
    const conn = await createTestDb();
    const created = await createAccount(conn, { name: 'Capital One Quicksilver', bank: 'capital_one', type: 'credit' });
    expect(created.currency).toBe('USD');

    const all = await listAccounts(conn);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Capital One Quicksilver');

    await renameAccount(conn, created.id, 'CapOne');
    const fetched = await getAccount(conn, created.id);
    expect(fetched?.name).toBe('CapOne');
  });

  it('returns null for a missing account', async () => {
    const conn = await createTestDb();
    expect(await getAccount(conn, 'nope')).toBeNull();
  });

  it('rejects an invalid bank or type', async () => {
    const conn = await createTestDb();
    await expect(createAccount(conn, { name: 'Bad', bank: 'chase', type: 'credit' })).rejects.toThrow();
    await expect(createAccount(conn, { name: 'Bad', bank: 'capital_one', type: 'prepaid' })).rejects.toThrow();
  });
});
