import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createVendor, listVendors } from '$lib/server/repos/vendors';

export const GET: RequestHandler = async () => {
	const conn = await getDb();
	return json(await listVendors(conn));
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	const aliases = Array.isArray(body.aliases) ? body.aliases.map(String) : [];
	const vendor = await createVendor(conn, String(body.name), aliases);
	return json(vendor);
};
