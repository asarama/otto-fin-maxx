import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { addVendorAlias } from '$lib/server/repos/vendors';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const conn = await getDb();
  await addVendorAlias(conn, params.id, String(body.name));
  return json({ ok: true });
};
