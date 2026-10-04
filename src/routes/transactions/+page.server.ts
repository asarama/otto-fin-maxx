import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { transactionsData } from '$lib/server/page-data';

export const load: PageServerLoad = async ({ url }) => {
	const conn = await getDb();
	const status = url.searchParams.get('status') ?? undefined;
	return transactionsData(conn, {
		accountId: url.searchParams.get('account') ?? undefined,
		month: url.searchParams.get('month') ?? undefined,
		search: url.searchParams.get('search') ?? undefined,
		status: status && status !== 'ignored' ? status : undefined,
		ignored: status === 'ignored' ? true : status === 'manual' ? false : undefined,
	});
};
