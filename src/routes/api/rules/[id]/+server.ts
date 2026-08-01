import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { updateRule, deleteRule } from '$lib/server/repos/rules';
import { categorizeUnreviewed } from '$lib/server/importCsv';
import { isValidRegex } from '$lib/matchers/rules';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  if (body.descriptionMatcher) {
    const pattern = String(body.descriptionMatcher);
    if (!isValidRegex(pattern)) throw error(400, `Invalid regex: ${pattern}`);
  }
  const conn = await getDb();
  await updateRule(conn, params.id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    descriptionMatcher: body.descriptionMatcher !== undefined ? (body.descriptionMatcher ? String(body.descriptionMatcher) : null) : undefined,
    amountOperator: body.amountOperator !== undefined ? body.amountOperator : undefined,
    amountCents: body.amountCents !== undefined ? (body.amountCents == null ? null : Number(body.amountCents)) : undefined,
    budgetCategoryId: body.budgetCategoryId !== undefined ? String(body.budgetCategoryId) : undefined,
    priority: body.priority !== undefined ? Number(body.priority) : undefined,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
    vendorIds: body.vendorIds !== undefined ? body.vendorIds.map(String) : undefined
  });
  await categorizeUnreviewed(conn);
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const conn = await getDb();
  await deleteRule(conn, params.id);
  await categorizeUnreviewed(conn);
  return json({ ok: true });
};
