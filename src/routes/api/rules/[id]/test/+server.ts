import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { listRules } from '$lib/server/repos/rules';
import { ruleMatches, type RuleSpec } from '$lib/matchers/rules';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const conn = await getDb();
  const rule = (await listRules(conn)).find((r) => r.id === params.id);
  if (!rule) throw error(404, 'Rule not found');
  const spec: RuleSpec = {
    id: rule.id,
    descriptionMatcher: rule.descriptionMatcher,
    amountOperator: rule.amountOperator,
    amountCents: rule.amountCents,
    vendorIds: rule.vendorIds
  };
  const matches = ruleMatches(spec, {
    description: String(body.description ?? ''),
    vendorId: body.vendorId ? String(body.vendorId) : null,
    amountCents: Number(body.amountCents ?? 0)
  });
  return json({ matches });
};
