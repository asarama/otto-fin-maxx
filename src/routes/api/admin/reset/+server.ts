import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { truncateAll } from '$lib/server/repos/admin';

export const POST: RequestHandler = async () => {
	const conn = await getDb();
	return json({ counts: await truncateAll(conn) });
};
