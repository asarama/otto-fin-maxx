import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createRule } from '$lib/server/repos/rules';
import { categorizeUnreviewed } from '$lib/server/importCsv';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const conn = await getDb();
  const descriptionMatcher = body.descriptionMatcher
    ? String(body.descriptionMatcher)
    : escapeRegex(String(body.description ?? ''));
  const rule = await createRule(conn, {
    name: String(body.name || 'Rule'),
    descriptionMatcher,
    amountOperator: body.amountOperator ?? 'any',
    amountCents: body.amountCents == null ? null : Number(body.amountCents),
    budgetCategoryId: String(body.budgetCategoryId),
    vendorIds: body.vendorId ? [String(body.vendorId)] : []
  });
  await categorizeUnreviewed(conn);
  return json(rule);
};
