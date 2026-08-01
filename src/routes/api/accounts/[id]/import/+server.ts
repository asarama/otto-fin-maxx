import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getAccount } from '$lib/server/repos/accounts';
import { parseBankCsv, type BankId } from '$lib/parsers';
import { importTransactions } from '$lib/server/importCsv';

export const POST: RequestHandler = async ({ params, request }) => {
	const conn = await getDb();
	const account = await getAccount(conn, params.id);
	if (!account) throw error(404, 'Account not found');

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No file uploaded');

	const csvText = await file.text();
	let parsed;
	try {
		parsed = parseBankCsv(account.bank as BankId, csvText);
	} catch (err) {
		throw error(400, `Could not parse CSV: ${(err as Error).message}`);
	}
	const result = await importTransactions(conn, account.id, parsed.rows);
	return json({ ...result, parseErrors: parsed.errors });
};
