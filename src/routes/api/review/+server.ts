import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { reviewData } from '$lib/server/page-data';

export const GET: RequestHandler = async () => {
	const conn = await getDb();
	return json(await reviewData(conn));
};
