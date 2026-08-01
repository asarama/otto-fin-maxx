import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { ensureBudgetCategoryMonth } from '$lib/server/repos/budgets';
import { assignTransaction } from '$lib/server/repos/transactions';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const conn = await getDb();
  const month = await ensureBudgetCategoryMonth(conn, String(body.budgetCategoryId), String(body.month));
  await assignTransaction(conn, params.id, month.id);
  return json({ ok: true });
};
