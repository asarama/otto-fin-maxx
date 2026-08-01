import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createBudget } from '$lib/server/repos/budgets';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	const budget = await createBudget(conn, {
		ownerId: String(body.ownerId),
		name: String(body.name),
	});
	return json(budget);
};
