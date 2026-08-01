import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { countUnreviewed } from '$lib/server/repos/transactions';

export const load: LayoutServerLoad = async () => {
	const conn = await getDb();
	return { unreviewedCount: await countUnreviewed(conn) };
};
