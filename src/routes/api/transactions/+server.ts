import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { transactionsData } from '$lib/server/page-data';

export const GET: RequestHandler = async ({ url }) => {
	const conn = await getDb();
	return json(
		await transactionsData(conn, {
			accountId: url.searchParams.get('account') ?? undefined,
			month: url.searchParams.get('month') ?? undefined,
			status: url.searchParams.get('status') ?? undefined,
			search: url.searchParams.get('search') ?? undefined,
		})
	);
};
