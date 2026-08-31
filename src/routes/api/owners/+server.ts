import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createOwner } from '$lib/server/repos/budgets';

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : 'Unexpected error';
}

const DOMAIN_ERRORS = ['Owner name cannot be empty', 'Owner already exists'];

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	try {
		return json(await createOwner(conn, String(body.name ?? '')));
	} catch (err) {
		const message = errorMessage(err);
		if (DOMAIN_ERRORS.some((prefix) => message.startsWith(prefix))) {
			throw error(400, message);
		}
		throw err;
	}
};
