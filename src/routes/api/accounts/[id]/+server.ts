import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { renameAccount, deleteAccount } from '$lib/server/repos/accounts';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const conn = await getDb();
	await renameAccount(conn, params.id, String(body.name));
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const conn = await getDb();
	await deleteAccount(conn, params.id);
	return json({ ok: true });
};
