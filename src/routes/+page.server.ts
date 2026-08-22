import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { dashboardData } from '$lib/server/page-data';

export const load: PageServerLoad = async ({ url }) => {
	const conn = await getDb();
	return dashboardData(conn, url.searchParams.get('month'));
};
