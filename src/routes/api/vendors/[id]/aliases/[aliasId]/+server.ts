import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { deleteVendorAlias } from '$lib/server/repos/vendors';

export const DELETE: RequestHandler = async ({ params }) => {
	const conn = await getDb();
	await deleteVendorAlias(conn, params.aliasId);
	return json({ ok: true });
};
