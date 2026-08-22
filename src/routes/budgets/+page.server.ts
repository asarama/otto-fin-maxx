import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { budgetsData } from '$lib/server/page-data';

export const load: PageServerLoad = async () => {
	const conn = await getDb();
	return budgetsData(conn);
};
