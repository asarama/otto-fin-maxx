import { readFileSync } from 'node:fs';
import { getDb } from '../src/lib/server/db';
import { getAccount } from '../src/lib/server/repos/accounts';
import { parseBankCsv } from '../src/lib/parsers';
import { importTransactions } from '../src/lib/server/importCsv';

const [accountId, filePath] = process.argv.slice(2);
if (!accountId || !filePath) {
  console.error('Usage: npm run import -- <accountId> <file.csv>');
  process.exit(1);
}

const conn = await getDb();
const account = await getAccount(conn, accountId);
if (!account) {
  console.error(`Account not found: ${accountId}`);
  process.exit(1);
}

const csvText = readFileSync(filePath, 'utf8');
const parsed = parseBankCsv(account.bank, csvText);
for (const err of parsed.errors) console.error(`SKIPPED ${err}`);
const result = await importTransactions(conn, account.id, parsed.rows);
console.log(`Imported ${result.imported}, duplicates ${result.duplicates}, categorized ${result.categorized}, parse errors ${parsed.errors.length}`);
