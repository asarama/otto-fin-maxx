import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createBudgetCategory } from '$lib/server/repos/budgets';
import { dollarsToCents } from '$lib/money';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const monthlyLimitCents = dollarsToCents(String(body.monthlyLimitCents ?? ''));
	if (!body.name || monthlyLimitCents === null) {
		return json({ error: 'name and monthlyLimitCents are required' }, { status: 400 });
	}
	const conn = await getDb();
	const category = await createBudgetCategory(conn, {
		budgetId: params.id,
		name: String(body.name),
		monthlyLimitCents,
	});
	return json(category);
};
