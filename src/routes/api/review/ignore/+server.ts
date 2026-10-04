import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { ignoreTransactions } from '$lib/server/repos/transactions';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	const txIds = Array.isArray(body.txIds) ? body.txIds.map(String) : [];
	await ignoreTransactions(conn, txIds);
	return json({ ignored: txIds.length });
};
