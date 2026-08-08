import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { deleteVendor } from '$lib/server/repos/vendors';

export const DELETE: RequestHandler = async ({ params }) => {
	const conn = await getDb();
	await deleteVendor(conn, params.id);
	return json({ ok: true });
};
