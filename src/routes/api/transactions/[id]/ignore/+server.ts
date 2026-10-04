import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { ignoreTransactions } from '$lib/server/repos/transactions';

export const POST: RequestHandler = async ({ params }) => {
	const conn = await getDb();
	await ignoreTransactions(conn, [params.id]);
	return json({ ok: true });
};
