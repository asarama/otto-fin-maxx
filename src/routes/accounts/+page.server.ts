import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listAccounts } from '$lib/server/repos/accounts';

export const load: PageServerLoad = async () => {
  const conn = await getDb();
  return { accounts: await listAccounts(conn) };
};
