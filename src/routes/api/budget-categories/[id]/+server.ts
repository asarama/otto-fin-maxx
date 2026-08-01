import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { updateBudgetCategoryLimit } from '$lib/server/repos/budgets';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const conn = await getDb();
  await updateBudgetCategoryLimit(conn, params.id, Math.round(Number(body.monthlyLimitCents) * 100));
  return json({ ok: true });
};
