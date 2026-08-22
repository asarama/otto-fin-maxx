import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { dashboardData } from '$lib/server/page-data';

export const GET: RequestHandler = async ({ url }) => {
	const conn = await getDb();
	return json(await dashboardData(conn, url.searchParams.get('month')));
};
