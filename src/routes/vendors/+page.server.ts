import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listVendors } from '$lib/server/repos/vendors';

export const load: PageServerLoad = async () => {
	const conn = await getDb();
	return { vendors: await listVendors(conn) };
};
