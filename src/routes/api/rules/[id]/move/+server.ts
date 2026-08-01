import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { moveRule } from '$lib/server/repos/rules';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const conn = await getDb();
	await moveRule(conn, params.id, body.direction === 'down' ? 'down' : 'up');
	return json({ ok: true });
};
