import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { listAccounts, createAccount } from '$lib/server/repos/accounts';

const BANKS = ['capital_one', 'bmo'];
const TYPES = ['credit', 'debit'];

export const GET: RequestHandler = async () => {
  const conn = await getDb();
  return json(await listAccounts(conn));
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const bank = String(body.bank);
  const type = String(body.type);
  if (!BANKS.includes(bank)) throw error(400, `Invalid bank: ${bank}`);
  if (!TYPES.includes(type)) throw error(400, `Invalid type: ${type}`);
  const conn = await getDb();
  const account = await createAccount(conn, {
    name: String(body.name),
    bank,
    type
  });
  return json(account);
};
