import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { categorizeUnreviewed } from '$lib/server/importCsv';

export const POST: RequestHandler = async () => {
	const conn = await getDb();
	const categorized = await categorizeUnreviewed(conn);
	return json({ categorized });
};
