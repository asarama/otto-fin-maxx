import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { ensureBudgetCategoryMonth } from '$lib/server/repos/budgets';
import { assignTransaction } from '$lib/server/repos/transactions';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const conn = await getDb();
	const budgetCategoryId = String(body.budgetCategoryId);
	for (const txId of body.txIds) {
		const tx = await conn.runAndReadAll(
			'SELECT posted_date FROM account_transactions WHERE id = ?',
			[String(txId)]
		);
		const rows = tx.getRowObjects();
		if (rows.length === 0) continue;
		const month = String(rows[0].posted_date).slice(0, 7);
		const bcm = await ensureBudgetCategoryMonth(conn, budgetCategoryId, month);
		await assignTransaction(conn, String(txId), bcm.id);
	}
	return json({ ok: true });
};
