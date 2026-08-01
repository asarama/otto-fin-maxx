import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getUnreviewed } from '$lib/server/repos/transactions';
import { listAccounts } from '$lib/server/repos/accounts';
import { listVendors } from '$lib/server/repos/vendors';
import { listBudgetCategories } from '$lib/server/repos/budgets';

export const load: PageServerLoad = async () => {
  const conn = await getDb();
  const txs = await getUnreviewed(conn);
  const accounts = new Map((await listAccounts(conn)).map((a) => [a.id, a.name]));
  const vendors = await listVendors(conn);
  const vendorNames = new Map(vendors.map((v) => [v.id, v.name]));
  return {
    transactions: txs.map((t) => ({
      ...t,
      accountName: accounts.get(t.accountId) ?? '?',
      vendorName: t.vendorId ? (vendorNames.get(t.vendorId) ?? null) : null
    })),
    vendors,
    categories: await listBudgetCategories(conn)
  };
};
