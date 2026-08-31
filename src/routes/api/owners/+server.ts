import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createOwner } from '$lib/server/repos/budgets';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	try {
		return json(await createOwner(conn, String(body.name ?? '')));
	} catch (err) {
		throw error(400, (err as Error).message);
	}
};
