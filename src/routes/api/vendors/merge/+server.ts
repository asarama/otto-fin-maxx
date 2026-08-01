import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { mergeVendors } from '$lib/server/repos/vendors';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	await mergeVendors(conn, String(body.keepId), String(body.removeId));
	return json({ ok: true });
};
