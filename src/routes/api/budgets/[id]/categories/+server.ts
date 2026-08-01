import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createBudgetCategory } from '$lib/server/repos/budgets';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const conn = await getDb();
  const cat = await createBudgetCategory(conn, {
    budgetId: params.id,
    name: String(body.name),
    monthlyLimitCents: Math.round(Number(body.monthlyLimitCents) * 100)
  });
  return json(cat);
};
