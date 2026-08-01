# Finance App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local SvelteKit app backed by a single DuckDB file that imports Capital One and BMO CSVs, categorizes debits into budget categories via rules, and reports monthly spend vs. limits.

**Architecture:** SvelteKit server (load functions + `+server.ts` routes) is the only layer that touches DuckDB. A singleton DuckDB connection is opened from `data/finance.db`; schema and default owners are seeded on first access. Pure logic (money, dates, CSV parsing, rule matching, vendor matching) lives in `$lib` and is unit-tested with Vitest against real-format sample CSVs. Repositories wrap all CRUD; an import pipeline runs parse → dedupe → vendor resolve → rule assign.

**Tech Stack:** SvelteKit (Svelte 5 runes), `@duckdb/node-api`, `csv-parse`, Vitest, TypeScript.

## Global Constraints

- Node.js 20+ (required by `@duckdb/node-api`).
- Money is always integer cents (`number`). Never use floats for money.
- Dates are stored as `TEXT` `'YYYY-MM-DD'`; months as `TEXT` `'YYYY-MM'`.
- All database access lives under `src/lib/server/` or inside `src/routes/**/+server.ts` / `+page.server.ts`. Nothing else imports `@duckdb/node-api`.
- `assignment_status` values: `'auto' | 'manual' | 'unreviewed'`.
- `amount_operator` values: `'any' | 'eq' | 'lt' | 'lte' | 'gt' | 'gte'`.
- `accounts.bank` values: `'capital_one' | 'bmo'`. `accounts.type` values: `'credit' | 'debit'`.
- Rule matching: first match wins by `priority` ascending; a match requires every set criterion to pass.
- Rule re-runs only touch transactions with `assignment_status = 'unreviewed'`; `'auto'`/`'manual'` are never overwritten.
- IDs are UUIDs generated in app code with `randomUUID()`.
- Code is written with no explanatory comments.

---

### Task 1: Scaffold SvelteKit project

**Files:**
- Create: `package.json`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `.gitignore`, `src/` (template files)

**Interfaces:**
- Produces: a working SvelteKit project with Vitest configured, `@duckdb/node-api`, `csv-parse`, `tsx`, and adapter-node installed.

- [ ] **Step 1: Scaffold the project into the existing repo**

Run (accept any interactive defaults if prompted):

```bash
npx sv create --template minimal --types ts --no-add-ons --install npm --no-dir-check .
npx sv add vitest
```

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
npm install @duckdb/node-api csv-parse
npm install -D @sveltejs/adapter-node tsx
```

- [ ] **Step 3: Switch adapter to node**

Replace the contents of `svelte.config.js` with:

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
```

- [ ] **Step 4: Configure Vitest for server code**

`sv add vitest` may have put the Vitest config in a separate `vitest.config.ts` or merged it into `vite.config.ts`. Locate the file that contains the `test` block (or the file Vitest loads), and make sure it contains the `test.environment` of `'node'` plus a `$lib` alias so tests can import `$lib/...`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      $lib: new URL('./src/lib', import.meta.url).pathname
    }
  },
  test: {
    environment: 'node'
  }
});
```

If Vitest loads `vite.config.ts`, replace its contents with the above. If a separate `vitest.config.ts` exists, put the `resolve.alias` and `test` blocks there instead (and confirm it merges the sveltekit plugin if needed). Afterward, run `npx vitest run` to confirm Vitest picks up the config.

- [ ] **Step 5: Ignore the database file**

Append to `.gitignore`:

```
data/
*.db
```

- [ ] **Step 6: Verify scaffold**

Run: `npm run check && npm run build && npx vitest run`
Expected: check passes, build succeeds, and `vitest` exits with a passing run (whether or not the template included a sample test).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold SvelteKit project"
```

---

### Task 2: Money, date, and external-id helpers

**Files:**
- Create: `src/lib/money.ts`, `src/lib/money.test.ts`, `src/lib/date.ts`, `src/lib/date.test.ts`, `src/lib/externalId.ts`, `src/lib/externalId.test.ts`

**Interfaces:**
- Produces:
  - `parseAmountToCents(input: string): number`
  - `centsToDollars(cents: number): string`
  - `normalizeDate(raw: string): string`
  - `externalId(accountId: string, postedDate: string, description: string, rawVendorName: string, amountCents: number): string`

Dedupe note: `externalId` is a stable hash of everything meaningful in a bank row (account, posted date, description, raw vendor name, amount). Two transactions that are identical in all five fields on the same account are indistinguishable from the bank's data — this is inherent to the CSV format, not a bug in the hash. The import pipeline counts such collisions as `duplicates` (never silently drops anything without reporting it), and the review queue is the place to spot-check any row you suspect was deduped. If Capital One/BMO exports ever include a stable transaction reference number, add it to this hash first — that is the correct long-term fix.

- [ ] **Step 1: Write the failing tests**

`src/lib/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseAmountToCents, centsToDollars } from './money';

describe('money', () => {
  it('parses thousands-separated amounts to cents', () => {
    expect(parseAmountToCents('1,234.56')).toBe(123456);
  });
  it('parses negative amounts to negative cents', () => {
    expect(parseAmountToCents('-50.00')).toBe(-5000);
  });
  it('parses a dollar-prefixed amount', () => {
    expect(parseAmountToCents('$45.5')).toBe(4550);
  });
  it('rejects garbage', () => {
    expect(() => parseAmountToCents('abc')).toThrow();
  });
  it('formats cents to dollars', () => {
    expect(centsToDollars(123456)).toBe('$1,234.56');
    expect(centsToDollars(-5000)).toBe('-$50.00');
  });
});
```

`src/lib/date.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeDate } from './date';

describe('normalizeDate', () => {
  it('passes through ISO dates', () => {
    expect(normalizeDate('2026-07-01')).toBe('2026-07-01');
  });
  it('converts MM/DD/YYYY to ISO', () => {
    expect(normalizeDate('07/01/2026')).toBe('2026-07-01');
    expect(normalizeDate('7/1/2026')).toBe('2026-07-01');
  });
  it('rejects unrecognized formats', () => {
    expect(() => normalizeDate('nope')).toThrow();
  });
});
```

`src/lib/externalId.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { externalId } from './externalId';

describe('externalId', () => {
  const base = { accountId: 'a', postedDate: '2026-07-01', description: 'COFFEE', rawVendorName: 'COFFEE', amountCents: -500 };
  it('is deterministic', () => {
    expect(externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, base.amountCents)).toBe(
      externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, base.amountCents)
    );
  });
  it('differs when amount changes', () => {
    expect(externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, -600)).not.toBe(
      externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, -500)
    );
  });
  it('differs when the raw vendor name changes', () => {
    expect(externalId(base.accountId, base.postedDate, base.description, 'AMZN MKTP US', base.amountCents)).not.toBe(
      externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, base.amountCents)
    );
  });
  it('differs across accounts', () => {
    expect(externalId('b', base.postedDate, base.description, base.rawVendorName, base.amountCents)).not.toBe(
      externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, base.amountCents)
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/money.test.ts src/lib/date.test.ts src/lib/externalId.test.ts`
Expected: FAIL with "Cannot find module './money'" (and the others).

- [ ] **Step 3: Implement**

`src/lib/money.ts`:

```ts
export function parseAmountToCents(input: string): number {
  const cleaned = input.replace(/[,$\s]/g, '');
  if (!cleaned) throw new Error(`Empty amount: ${input}`);
  const value = Number(cleaned);
  if (Number.isNaN(value)) throw new Error(`Invalid amount: ${input}`);
  return Math.round(value * 100);
}

export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = (Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${sign}$${abs}`;
}
```

`src/lib/date.ts`:

```ts
export function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  throw new Error(`Unrecognized date: ${raw}`);
}
```

`src/lib/externalId.ts`:

```ts
import { createHash } from 'node:crypto';

export function externalId(accountId: string, postedDate: string, description: string, rawVendorName: string, amountCents: number): string {
  const raw = [accountId, postedDate, description, rawVendorName, amountCents].join('|');
  return createHash('sha1').update(raw).digest('hex');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/money.test.ts src/lib/date.test.ts src/lib/externalId.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts src/lib/date.ts src/lib/date.test.ts src/lib/externalId.ts src/lib/externalId.test.ts
git commit -m "feat: add money, date, and external-id helpers"
```

### Task 3: DuckDB schema, connection, and seed

**Files:**
- Create: `src/lib/server/schema.ts`, `src/lib/server/seed.ts`, `src/lib/server/db.ts`, `src/lib/server/test-helpers.ts`, `src/lib/server/db.test.ts`

**Interfaces:**
- Produces:
  - `SCHEMA_SQL: string` (full DDL)
  - `seedDefaults(conn: DuckDBConnection): Promise<void>`
  - `getDb(): Promise<DuckDBConnection>` (process singleton; opens `data/finance.db`)
  - `createTestDb(): Promise<DuckDBConnection>` (in-memory, schema + seed applied)

- [ ] **Step 1: Write the failing test**

`src/lib/server/db.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-helpers';
import { seedDefaults } from './seed';

describe('schema + seed', () => {
  it('creates all tables', async () => {
    const conn = await createTestDb();
    const res = await conn.runAndReadAll(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'main' ORDER BY table_name`
    );
    const names = res.getRowObjects().map((r) => r.table_name);
    expect(names).toEqual([
      'account_transactions', 'accounts', 'budget_categories',
      'budget_category_months', 'budgets', 'owners', 'rule_vendors',
      'rules', 'vendor_aliases', 'vendors'
    ]);
  });

  it('seeds owners, budgets, and General categories', async () => {
    const conn = await createTestDb();
    const owners = await conn.runAndReadAll('SELECT name FROM owners ORDER BY name');
    expect(owners.getRowObjects().map((r) => r.name)).toEqual(['Family', 'Me', 'Wife']);
    const cats = await conn.runAndReadAll(
      'SELECT bc.name FROM budget_categories bc JOIN budgets b ON b.id = bc.budget_id'
    );
    expect(cats.getRowObjects()).toHaveLength(3);
    for (const row of cats.getRowObjects()) expect(row.name).toBe('General');
  });

  it('seed is idempotent', async () => {
    const conn = await createTestDb();
    await seedDefaults(conn);
    const owners = await conn.runAndReadAll('SELECT count(*) AS n FROM owners');
    expect(Number(owners.getRowObjects()[0].n)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/db.test.ts`
Expected: FAIL with "Cannot find module './test-helpers'".

- [ ] **Step 3: Implement the schema**

`src/lib/server/schema.ts`:

```ts
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bank TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id),
  name TEXT NOT NULL,
  monthly_limit_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_category_months (
  id TEXT PRIMARY KEY,
  budget_category_id TEXT NOT NULL REFERENCES budget_categories(id),
  month TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  UNIQUE (budget_category_id, month)
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendor_aliases (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  external_id TEXT NOT NULL UNIQUE,
  posted_date TEXT NOT NULL,
  description TEXT NOT NULL,
  raw_vendor_name TEXT,
  amount_cents INTEGER NOT NULL,
  vendor_id TEXT REFERENCES vendors(id),
  budget_category_month_id TEXT REFERENCES budget_category_months(id),
  assignment_status TEXT NOT NULL DEFAULT 'unreviewed',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description_matcher TEXT,
  amount_operator TEXT NOT NULL DEFAULT 'any',
  amount_cents INTEGER,
  budget_category_id TEXT NOT NULL REFERENCES budget_categories(id),
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS rule_vendors (
  rule_id TEXT NOT NULL REFERENCES rules(id),
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  PRIMARY KEY (rule_id, vendor_id)
);
`;
```

- [ ] **Step 4: Implement the seed**

`src/lib/server/seed.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

const OWNER_NAMES = ['Me', 'Wife', 'Family'];

export async function seedDefaults(conn: DuckDBConnection): Promise<void> {
  for (const name of OWNER_NAMES) {
    const owners = await conn.runAndReadAll('SELECT id FROM owners WHERE name = ?', [name]);
    let ownerId: string;
    if (owners.getRowObjects().length === 0) {
      ownerId = randomUUID();
      await conn.run('INSERT INTO owners (id, name) VALUES (?, ?)', [ownerId, name]);
    } else {
      ownerId = String(owners.getRowObjects()[0].id);
    }

    const budgets = await conn.runAndReadAll('SELECT id FROM budgets WHERE owner_id = ? AND name = ?', [ownerId, name]);
    let budgetId: string;
    if (budgets.getRowObjects().length === 0) {
      budgetId = randomUUID();
      await conn.run(
        'INSERT INTO budgets (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)',
        [budgetId, ownerId, name, new Date().toISOString()]
      );
    } else {
      budgetId = String(budgets.getRowObjects()[0].id);
    }

    const cats = await conn.runAndReadAll('SELECT id FROM budget_categories WHERE budget_id = ? AND name = ?', [budgetId, 'General']);
    if (cats.getRowObjects().length === 0) {
      const catId = randomUUID();
      await conn.run(
        'INSERT INTO budget_categories (id, budget_id, name, monthly_limit_cents, created_at) VALUES (?, ?, ?, ?, ?)',
        [catId, budgetId, 'General', 0, new Date().toISOString()]
      );
    }
  }
}
```

- [ ] **Step 5: Implement the connection singleton**

`src/lib/server/db.ts`:

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { SCHEMA_SQL } from './schema';
import { seedDefaults } from './seed';

const g = globalThis as unknown as { __financeDbConnection?: DuckDBConnection };

export function getDbPath(): string {
  return process.env.FINANCE_DB_PATH ?? 'data/finance.db';
}

export async function getDb(): Promise<DuckDBConnection> {
  if (g.__financeDbConnection) return g.__financeDbConnection;
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const instance = await DuckDBInstance.create(path);
  const conn = await instance.connect();
  await conn.run(SCHEMA_SQL);
  await seedDefaults(conn);
  g.__financeDbConnection = conn;
  return conn;
}
```

- [ ] **Step 6: Implement the test helper**

`src/lib/server/test-helpers.ts`:

```ts
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { SCHEMA_SQL } from './schema';
import { seedDefaults } from './seed';

export async function createTestDb(): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  await conn.run(SCHEMA_SQL);
  await seedDefaults(conn);
  return conn;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/db.test.ts`
Expected: PASS (tables created, seeds present, idempotent).

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/schema.ts src/lib/server/seed.ts src/lib/server/db.ts src/lib/server/test-helpers.ts src/lib/server/db.test.ts
git commit -m "feat: add duckdb schema, connection, and seed"
```

---

### Task 4: CSV parsers

**Files:**
- Create: `src/lib/parsers/types.ts`, `src/lib/parsers/capitalOne.ts`, `src/lib/parsers/bmo.ts`, `src/lib/parsers/index.ts`, `src/lib/parsers/fixtures/capitalOne-sample.csv`, `src/lib/parsers/fixtures/bmo-sample.csv`, `src/lib/parsers/capitalOne.test.ts`, `src/lib/parsers/bmo.test.ts`

**Interfaces:**
- Produces:
  - `interface ParsedRow { postedDate: string; description: string; rawVendorName: string; amountCents: number }`
  - `interface ParseResult { rows: ParsedRow[]; errors: string[] }`
  - `parseCapitalOne(csvText: string): ParseResult`
  - `parseBmo(csvText: string): ParseResult`
  - `type BankId = 'capital_one' | 'bmo'`
  - `parseBankCsv(bank: BankId, csvText: string): ParseResult`

Parsing is row-tolerant: an invalid row is skipped, its problem recorded in `errors` (with the 1-based spreadsheet row number, header = row 1), and the remaining valid rows still come back in `rows`. `parseBankCsv` throws only for an unknown bank, never for bad CSV content.

Note: Capital One and BMO column headers vary by export type. Each parser reads headers by name; if a real export differs, adjust the property names used in the parser and update the fixture. The mapping lives in one obvious place at the top of each parser.

- [ ] **Step 1: Create the fixture CSVs**

`src/lib/parsers/fixtures/capitalOne-sample.csv`:

```csv
Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-07-01,2026-07-02,X1234,AMZN MKTP US,Amazon,45.67,
2026-07-03,2026-07-04,X1234,UBER *TRIP,Gas,12.34,
2026-07-05,2026-07-06,X1234,PAYMENT THANK YOU,Payment,,200.00
```

`src/lib/parsers/fixtures/bmo-sample.csv`:

```csv
Date,Description,Type,Amount,Balance
07/01/2026,WALMART #1234,Debit,-54.20,1045.80
07/02/2026,PAYROLL,Deposit,2000.00,3045.80
07/03/2026,SHELL OIL,Debit,-38.90,3006.90
```

- [ ] **Step 2: Write the failing tests**

`src/lib/parsers/capitalOne.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseCapitalOne } from './capitalOne';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/capitalOne-sample.csv', import.meta.url)), 'utf8');

describe('parseCapitalOne', () => {
  it('parses debits as negative cents and credits as positive cents', () => {
    const { rows, errors } = parseCapitalOne(fixture);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      postedDate: '2026-07-02',
      description: 'AMZN MKTP US',
      rawVendorName: 'AMZN MKTP US',
      amountCents: -4567
    });
    expect(rows[1].amountCents).toBe(-1234);
    expect(rows[2].amountCents).toBe(20000);
  });

  it('reports bad rows and keeps the valid ones', () => {
    const csv = [
      'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
      '2026-07-01,2026-07-02,X1,GOOD ONE,Food,5.00,',
      '2026-07-03,2026-07-04,X1,BAD AMOUNT,Food,not-a-number,',
      '2026-07-05,2026-07-06,X1,GOOD TWO,Food,,7.00'
    ].join('\n');
    const { rows, errors } = parseCapitalOne(csv);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.description)).toEqual(['GOOD ONE', 'GOOD TWO']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Row 3/);
  });
});
```

`src/lib/parsers/bmo.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseBmo } from './bmo';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/bmo-sample.csv', import.meta.url)), 'utf8');

describe('parseBmo', () => {
  it('parses MM/DD/YYYY dates and debit/credit signs', () => {
    const { rows, errors } = parseBmo(fixture);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      postedDate: '2026-07-01',
      description: 'WALMART #1234',
      rawVendorName: 'WALMART #1234',
      amountCents: -5420
    });
    expect(rows[1].amountCents).toBe(200000);
    expect(rows[2].amountCents).toBe(-3890);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/parsers`
Expected: FAIL with "Cannot find module './capitalOne'".

- [ ] **Step 4: Implement**

`src/lib/parsers/types.ts`:

```ts
export interface ParsedRow {
  postedDate: string;
  description: string;
  rawVendorName: string;
  amountCents: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
}
```

`src/lib/parsers/capitalOne.ts`:

```ts
import { parse } from 'csv-parse/sync';
import { parseAmountToCents } from '../money';
import { normalizeDate } from '../date';
import type { ParseResult, ParsedRow } from './types';

export function parseCapitalOne(csvText: string): ParseResult {
  const records = parse(csvText, { columns: true, skip_empty_lines: true });
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  records.forEach((rec, i) => {
    try {
      const description = String(rec.Description ?? '').trim();
      const debit = String(rec.Debit ?? '').trim();
      const credit = String(rec.Credit ?? '').trim();
      const amountCents = debit
        ? -parseAmountToCents(debit)
        : parseAmountToCents(credit);
      rows.push({
        postedDate: normalizeDate(String(rec['Posted Date'] ?? rec['Transaction Date'])),
        description,
        rawVendorName: description,
        amountCents
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${(err as Error).message}`);
    }
  });
  return { rows, errors };
}
```

`src/lib/parsers/bmo.ts`:

```ts
import { parse } from 'csv-parse/sync';
import { parseAmountToCents } from '../money';
import { normalizeDate } from '../date';
import type { ParseResult, ParsedRow } from './types';

export function parseBmo(csvText: string): ParseResult {
  const records = parse(csvText, { columns: true, skip_empty_lines: true });
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  records.forEach((rec, i) => {
    try {
      const description = String(rec.Description ?? '').trim();
      const type = String(rec.Type ?? '').trim().toLowerCase();
      const amount = parseAmountToCents(String(rec.Amount ?? ''));
      let amountCents: number;
      if (type === 'credit' || type === 'deposit') amountCents = Math.abs(amount);
      else if (type === 'debit' || type === 'withdrawal') amountCents = -Math.abs(amount);
      else amountCents = amount;
      rows.push({
        postedDate: normalizeDate(String(rec.Date ?? '')),
        description,
        rawVendorName: description,
        amountCents
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${(err as Error).message}`);
    }
  });
  return { rows, errors };
}
```

`src/lib/parsers/index.ts`:

```ts
import { parseCapitalOne } from './capitalOne';
import { parseBmo } from './bmo';
import type { ParseResult } from './types';

export type BankId = 'capital_one' | 'bmo';
export type { ParsedRow, ParseResult } from './types';

export function parseBankCsv(bank: BankId, csvText: string): ParseResult {
  if (bank === 'capital_one') return parseCapitalOne(csvText);
  if (bank === 'bmo') return parseBmo(csvText);
  throw new Error(`Unknown bank: ${bank}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/parsers`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/parsers
git commit -m "feat: add capital one and bmo csv parsers"
```

---

### Task 5: Rule matcher

**Files:**
- Create: `src/lib/matchers/rules.ts`, `src/lib/matchers/rules.test.ts`

**Interfaces:**
- Produces:
  - `type AmountOperator = 'any' | 'eq' | 'lt' | 'lte' | 'gt' | 'gte'`
  - `interface RuleSpec { id: string; descriptionMatcher: string | null; amountOperator: AmountOperator; amountCents: number | null; vendorIds: string[] }`
  - `interface TransactionCandidate { description: string; vendorId: string | null; amountCents: number }`
  - `ruleMatches(rule: RuleSpec, tx: TransactionCandidate): boolean`
  - `firstMatchingRule(rules: RuleSpec[], tx: TransactionCandidate): RuleSpec | null`
  - `isValidRegex(pattern: string): boolean`

- [ ] **Step 1: Write the failing test**

`src/lib/matchers/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ruleMatches, firstMatchingRule, isValidRegex, type RuleSpec } from './rules';

const tx = { description: 'AMZN MKTP US', vendorId: 'v1', amountCents: -4567 };

describe('ruleMatches', () => {
  it('matches an empty rule', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(true);
  });
  it('matches on description regex', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: '^AMZN', amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(true);
  });
  it('rejects when description regex does not match', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: '^NETFLIX', amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(false);
  });
  it('requires one of the listed vendors when present', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'any', amountCents: null, vendorIds: ['v2'] };
    expect(ruleMatches(rule, tx)).toBe(false);
  });
  it('compares debit magnitude against lt', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'lt', amountCents: 5000, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(true);
    const big: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'lt', amountCents: 1000, vendorIds: [] };
    expect(ruleMatches(big, tx)).toBe(false);
  });
  it('compares debit magnitude against gte', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'gte', amountCents: 4567, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(true);
  });
  it('returns false for an invalid regex', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: '(', amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(false);
  });
});

describe('firstMatchingRule', () => {
  it('returns the first matching rule by list order', () => {
    const a: RuleSpec = { id: 'a', descriptionMatcher: '^AMZN', amountOperator: 'any', amountCents: null, vendorIds: [] };
    const b: RuleSpec = { id: 'b', descriptionMatcher: null, amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(firstMatchingRule([a, b], tx)?.id).toBe('a');
    expect(firstMatchingRule([b, a], tx)?.id).toBe('b');
  });
  it('returns null when nothing matches', () => {
    const a: RuleSpec = { id: 'a', descriptionMatcher: '^NETFLIX', amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(firstMatchingRule([a], tx)).toBeNull();
  });
});

describe('isValidRegex', () => {
  it('accepts a valid pattern', () => {
    expect(isValidRegex('^AMZN')).toBe(true);
  });
  it('rejects a malformed pattern', () => {
    expect(isValidRegex('(')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matchers/rules.test.ts`
Expected: FAIL with "Cannot find module './rules'".

- [ ] **Step 3: Implement**

`src/lib/matchers/rules.ts`:

```ts
export type AmountOperator = 'any' | 'eq' | 'lt' | 'lte' | 'gt' | 'gte';

export interface RuleSpec {
  id: string;
  descriptionMatcher: string | null;
  amountOperator: AmountOperator;
  amountCents: number | null;
  vendorIds: string[];
}

export interface TransactionCandidate {
  description: string;
  vendorId: string | null;
  amountCents: number;
}

export function ruleMatches(rule: RuleSpec, tx: TransactionCandidate): boolean {
  if (rule.descriptionMatcher) {
    let re: RegExp;
    try {
      re = new RegExp(rule.descriptionMatcher, 'i');
    } catch {
      return false;
    }
    if (!re.test(tx.description)) return false;
  }
  if (rule.vendorIds.length > 0) {
    if (!tx.vendorId || !rule.vendorIds.includes(tx.vendorId)) return false;
  }
  if (rule.amountOperator !== 'any' && rule.amountCents !== null) {
    const a = Math.abs(tx.amountCents);
    switch (rule.amountOperator) {
      case 'eq': if (a !== rule.amountCents) return false; break;
      case 'lt': if (!(a < rule.amountCents)) return false; break;
      case 'lte': if (!(a <= rule.amountCents)) return false; break;
      case 'gt': if (!(a > rule.amountCents)) return false; break;
      case 'gte': if (!(a >= rule.amountCents)) return false; break;
    }
  }
  return true;
}

export function firstMatchingRule(rules: RuleSpec[], tx: TransactionCandidate): RuleSpec | null {
  for (const rule of rules) {
    if (ruleMatches(rule, tx)) return rule;
  }
  return null;
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matchers/rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchers/rules.ts src/lib/matchers/rules.test.ts
git commit -m "feat: add rule matcher"
```

---

### Task 6: Vendor matcher

**Files:**
- Create: `src/lib/matchers/vendors.ts`, `src/lib/matchers/vendors.test.ts`

**Interfaces:**
- Produces:
  - `interface VendorSpec { id: string; name: string; aliases: string[] }`
  - `normalizeName(s: string): string`
  - `resolveVendor(rawName: string, vendors: VendorSpec[]): string | null`

- [ ] **Step 1: Write the failing test**

`src/lib/matchers/vendors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveVendor, type VendorSpec } from './vendors';

const vendors: VendorSpec[] = [
  { id: 'v1', name: 'Amazon', aliases: ['AMZN MKTP US', 'AMAZON.COM'] },
  { id: 'v2', name: 'Uber', aliases: ['UBER *TRIP'] }
];

describe('resolveVendor', () => {
  it('matches the main name case-insensitively', () => {
    expect(resolveVendor('amazon', vendors)).toBe('v1');
  });
  it('matches an alias', () => {
    expect(resolveVendor('AMZN MKTP US', vendors)).toBe('v1');
    expect(resolveVendor('UBER *TRIP', vendors)).toBe('v2');
  });
  it('collapses whitespace before matching', () => {
    expect(resolveVendor('  UBER   *TRIP  ', vendors)).toBe('v2');
  });
  it('returns null when nothing matches', () => {
    expect(resolveVendor('SOME OTHER STORE', vendors)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matchers/vendors.test.ts`
Expected: FAIL with "Cannot find module './vendors'".

- [ ] **Step 3: Implement**

`src/lib/matchers/vendors.ts`:

```ts
export interface VendorSpec {
  id: string;
  name: string;
  aliases: string[];
}

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveVendor(rawName: string, vendors: VendorSpec[]): string | null {
  const target = normalizeName(rawName);
  for (const vendor of vendors) {
    if (normalizeName(vendor.name) === target) return vendor.id;
    for (const alias of vendor.aliases) {
      if (normalizeName(alias) === target) return vendor.id;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matchers/vendors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchers/vendors.ts src/lib/matchers/vendors.test.ts
git commit -m "feat: add vendor matcher"
```

### Task 7: Accounts and vendors repositories

**Files:**
- Create: `src/lib/server/repos/accounts.ts`, `src/lib/server/repos/accounts.test.ts`, `src/lib/server/repos/vendors.ts`, `src/lib/server/repos/vendors.test.ts`

**Interfaces:**
- Produces:
  - `interface Account { id: string; name: string; bank: string; type: string; currency: string; created_at: string }`
  - `listAccounts(conn): Promise<Account[]>`
  - `createAccount(conn, input: { name: string; bank: string; type: string }): Promise<Account>`
  - `renameAccount(conn, id: string, name: string): Promise<void>`
  - `getAccount(conn, id: string): Promise<Account | null>`
  - `interface Vendor { id: string; name: string; aliases: string[] }`
  - `listVendors(conn): Promise<Vendor[]>`
  - `createVendor(conn, name: string, aliases?: string[]): Promise<Vendor>`
  - `addVendorAlias(conn, vendorId: string, name: string): Promise<void>`
  - `mergeVendors(conn, keepId: string, removeId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`src/lib/server/repos/accounts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { listAccounts, createAccount, renameAccount, getAccount } from './accounts';

describe('accounts repo', () => {
  it('creates, lists, renames, and fetches accounts', async () => {
    const conn = await createTestDb();
    const created = await createAccount(conn, { name: 'Capital One Quicksilver', bank: 'capital_one', type: 'credit' });
    expect(created.currency).toBe('USD');

    const all = await listAccounts(conn);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Capital One Quicksilver');

    await renameAccount(conn, created.id, 'CapOne');
    const fetched = await getAccount(conn, created.id);
    expect(fetched?.name).toBe('CapOne');
  });

  it('returns null for a missing account', async () => {
    const conn = await createTestDb();
    expect(await getAccount(conn, 'nope')).toBeNull();
  });

  it('rejects an invalid bank or type', async () => {
    const conn = await createTestDb();
    await expect(createAccount(conn, { name: 'Bad', bank: 'chase', type: 'credit' })).rejects.toThrow();
    await expect(createAccount(conn, { name: 'Bad', bank: 'capital_one', type: 'prepaid' })).rejects.toThrow();
  });
});
```

`src/lib/server/repos/vendors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { createAccount } from './accounts';
import { listVendors, createVendor, addVendorAlias, mergeVendors } from './vendors';

describe('vendors repo', () => {
  it('creates a vendor with aliases and lists them', async () => {
    const conn = await createTestDb();
    const v = await createVendor(conn, 'Amazon', ['AMZN MKTP US']);
    const vendors = await listVendors(conn);
    expect(vendors).toHaveLength(1);
    expect(vendors[0].name).toBe('Amazon');
    expect(vendors[0].aliases).toEqual(['AMZN MKTP US']);
    expect(v.id).toBe(vendors[0].id);
  });

  it('adds an alias to an existing vendor', async () => {
    const conn = await createTestDb();
    const v = await createVendor(conn, 'Amazon');
    await addVendorAlias(conn, v.id, 'AMAZON.COM');
    const vendors = await listVendors(conn);
    expect(vendors[0].aliases).toEqual(['AMAZON.COM']);
  });

  it('merges two vendors, reassigning transactions', async () => {
    const conn = await createTestDb();
    const account = await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
    const keep = await createVendor(conn, 'Amazon', ['AMZN MKTP US']);
    const remove = await createVendor(conn, 'Amazon Prime', ['PRIME VIDEO']);
    await conn.run(
      `INSERT INTO account_transactions
       (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['t1', account.id, 'e1', '2026-07-01', 'PRIME VIDEO', 'PRIME VIDEO', -500, remove.id, 'unreviewed', '2026-07-01']
    );
    await mergeVendors(conn, keep.id, remove.id);

    const vendors = await listVendors(conn);
    expect(vendors).toHaveLength(1);
    expect(vendors[0].name).toBe('Amazon');
    expect(vendors[0].aliases.sort()).toEqual(['AMZN MKTP US', 'PRIME VIDEO']);

    const tx = await conn.runAndReadAll('SELECT vendor_id FROM account_transactions WHERE id = ?', ['t1']);
    expect(tx.getRowObjects()[0].vendor_id).toBe(keep.id);
  });

  it('merges vendors that share a rule without primary-key conflicts', async () => {
    const conn = await createTestDb();
    const keep = await createVendor(conn, 'Amazon');
    const remove = await createVendor(conn, 'Amazon Prime');
    const catRow = await conn.runAndReadAll('SELECT id FROM budget_categories LIMIT 1');
    const catId = String(catRow.getRowObjects()[0].id);
    const ruleId = 'rule-amazon';
    await conn.run(
      `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES (?, 'Amazon', NULL, 'any', NULL, ?, 1, true)`,
      [ruleId, catId]
    );
    await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?), (?, ?)', [ruleId, keep.id, ruleId, remove.id]);

    await mergeVendors(conn, keep.id, remove.id);

    const rv = await conn.runAndReadAll('SELECT vendor_id FROM rule_vendors WHERE rule_id = ?', [ruleId]);
    expect(rv.getRowObjects().map((r) => String(r.vendor_id))).toEqual([keep.id]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/repos/accounts.test.ts src/lib/server/repos/vendors.test.ts`
Expected: FAIL with "Cannot find module './accounts'".

- [ ] **Step 3: Implement accounts repo**

`src/lib/server/repos/accounts.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

export interface Account {
  id: string;
  name: string;
  bank: string;
  type: string;
  currency: string;
  created_at: string;
}

const BANKS = ['capital_one', 'bmo'];
const TYPES = ['credit', 'debit'];

function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    name: String(row.name),
    bank: String(row.bank),
    type: String(row.type),
    currency: String(row.currency),
    created_at: String(row.created_at)
  };
}

export async function listAccounts(conn: DuckDBConnection): Promise<Account[]> {
  const reader = await conn.runAndReadAll('SELECT * FROM accounts ORDER BY created_at');
  return reader.getRowObjects().map(rowToAccount);
}

export async function getAccount(conn: DuckDBConnection, id: string): Promise<Account | null> {
  const reader = await conn.runAndReadAll('SELECT * FROM accounts WHERE id = ?', [id]);
  const rows = reader.getRowObjects();
  return rows.length > 0 ? rowToAccount(rows[0]) : null;
}

export async function createAccount(
  conn: DuckDBConnection,
  input: { name: string; bank: string; type: string }
): Promise<Account> {
  if (!BANKS.includes(input.bank)) throw new Error(`Invalid bank: ${input.bank}`);
  if (!TYPES.includes(input.type)) throw new Error(`Invalid type: ${input.type}`);
  const id = randomUUID();
  await conn.run(
    'INSERT INTO accounts (id, name, bank, type, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, input.name, input.bank, input.type, 'USD', new Date().toISOString()]
  );
  const created = await getAccount(conn, id);
  if (!created) throw new Error('Account creation failed');
  return created;
}

export async function renameAccount(conn: DuckDBConnection, id: string, name: string): Promise<void> {
  await conn.run('UPDATE accounts SET name = ? WHERE id = ?', [name, id]);
}
```

- [ ] **Step 4: Implement vendors repo**

`src/lib/server/repos/vendors.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

export interface Vendor {
  id: string;
  name: string;
  aliases: string[];
}

export async function listVendors(conn: DuckDBConnection): Promise<Vendor[]> {
  const reader = await conn.runAndReadAll(
    `SELECT v.id, v.name, va.name AS alias
     FROM vendors v
     LEFT JOIN vendor_aliases va ON va.vendor_id = v.id
     ORDER BY v.name, va.name`
  );
  const byId = new Map<string, Vendor>();
  for (const row of reader.getRowObjects()) {
    const id = String(row.id);
    if (!byId.has(id)) {
      byId.set(id, { id, name: String(row.name), aliases: [] });
    }
    if (row.alias !== null && row.alias !== undefined) {
      byId.get(id)!.aliases.push(String(row.alias));
    }
  }
  return [...byId.values()];
}

export async function createVendor(conn: DuckDBConnection, name: string, aliases: string[] = []): Promise<Vendor> {
  const id = randomUUID();
  await conn.run('INSERT INTO vendors (id, name, created_at) VALUES (?, ?, ?)', [id, name, new Date().toISOString()]);
  for (const alias of aliases) {
    await conn.run(
      'INSERT INTO vendor_aliases (id, vendor_id, name, created_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), id, alias, new Date().toISOString()]
    );
  }
  return { id, name, aliases: [...aliases] };
}

export async function addVendorAlias(conn: DuckDBConnection, vendorId: string, name: string): Promise<void> {
  await conn.run(
    'INSERT INTO vendor_aliases (id, vendor_id, name, created_at) VALUES (?, ?, ?, ?)',
    [randomUUID(), vendorId, name, new Date().toISOString()]
  );
}

export async function mergeVendors(conn: DuckDBConnection, keepId: string, removeId: string): Promise<void> {
  await conn.run(
    `DELETE FROM rule_vendors WHERE vendor_id = ? AND rule_id IN (
       SELECT rule_id FROM rule_vendors WHERE vendor_id = ?
     )`,
    [removeId, keepId]
  );
  await conn.run('UPDATE vendor_aliases SET vendor_id = ? WHERE vendor_id = ?', [keepId, removeId]);
  await conn.run('UPDATE account_transactions SET vendor_id = ? WHERE vendor_id = ?', [keepId, removeId]);
  await conn.run('UPDATE rule_vendors SET vendor_id = ? WHERE vendor_id = ?', [keepId, removeId]);
  await conn.run(
    `DELETE FROM vendor_aliases WHERE id IN (
       SELECT a.id FROM vendor_aliases a
       JOIN vendor_aliases b ON a.vendor_id = b.vendor_id
         AND lower(a.name) = lower(b.name) AND a.id > b.id
     )`
  );
  await conn.run('DELETE FROM vendors WHERE id = ?', [removeId]);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/repos/accounts.test.ts src/lib/server/repos/vendors.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/repos
git commit -m "feat: add accounts and vendors repositories"
```

---

### Task 8: Budgets repositories

**Files:**
- Create: `src/lib/server/repos/budgets.ts`, `src/lib/server/repos/budgets.test.ts`

**Interfaces:**
- Produces:
  - `interface Owner { id: string; name: string }`
  - `interface Budget { id: string; name: string; owner_id: string }`
  - `interface BudgetCategory { id: string; budget_id: string; name: string; monthly_limit_cents: number }`
  - `interface BudgetCategoryMonth { id: string; budget_category_id: string; month: string; amount_cents: number }`
  - `listOwners(conn): Promise<Owner[]>`
  - `listBudgets(conn): Promise<Budget[]>`
  - `createBudget(conn, input: { ownerId: string; name: string }): Promise<Budget>`
  - `listBudgetCategories(conn): Promise<BudgetCategory[]>`
  - `createBudgetCategory(conn, input: { budgetId: string; name: string; monthlyLimitCents: number }): Promise<BudgetCategory>`
  - `updateBudgetCategoryLimit(conn, id: string, monthlyLimitCents: number): Promise<void>` — updates the category and re-snapshots the **current** month's `budget_category_months` row to the new value. Already-created past months keep their snapshot; future months snapshot the new value when first created.
  - `ensureBudgetCategoryMonth(conn, budgetCategoryId: string, month: string): Promise<BudgetCategoryMonth>`
  - `listBudgetCategoryMonths(conn, month: string): Promise<BudgetCategoryMonth[]>`

- [ ] **Step 1: Write the failing test**

`src/lib/server/repos/budgets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import {
  listOwners, listBudgets, createBudget, listBudgetCategories,
  createBudgetCategory, updateBudgetCategoryLimit,
  ensureBudgetCategoryMonth, listBudgetCategoryMonths
} from './budgets';

describe('budgets repo', () => {
  it('lists seeded owners', async () => {
    const conn = await createTestDb();
    const owners = await listOwners(conn);
    expect(owners.map((o) => o.name)).toEqual(['Family', 'Me', 'Wife']);
  });

  it('creates a budget and category under an owner', async () => {
    const conn = await createTestDb();
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const cat = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });

    const budgets = await listBudgets(conn);
    expect(budgets.some((b) => b.id === budget.id && b.owner_id === me.id)).toBe(true);

    const cats = await listBudgetCategories(conn);
    expect(cats.some((c) => c.id === cat.id && c.monthly_limit_cents === 10000)).toBe(true);

    await updateBudgetCategoryLimit(conn, cat.id, 15000);
    const updated = (await listBudgetCategories(conn)).find((c) => c.id === cat.id)!;
    expect(updated.monthly_limit_cents).toBe(15000);
  });

  it('ensures a month snapshot with the current limit', async () => {
    const conn = await createTestDb();
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const cat = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });

    const m1 = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
    const m2 = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
    expect(m1.id).toBe(m2.id);
    expect(m1.amount_cents).toBe(10000);

    const all = await listBudgetCategoryMonths(conn, '2026-07');
    expect(all).toHaveLength(1);
    expect(all[0].amount_cents).toBe(10000);
  });

  it('updating a limit preserves past snapshots and applies to future months', async () => {
    const conn = await createTestDb();
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const cat = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });

    await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');
    await updateBudgetCategoryLimit(conn, cat.id, 15000);

    const july = await listBudgetCategoryMonths(conn, '2026-07');
    expect(july[0].amount_cents).toBe(10000);

    const august = await ensureBudgetCategoryMonth(conn, cat.id, '2026-08');
    expect(august.amount_cents).toBe(15000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/repos/budgets.test.ts`
Expected: FAIL with "Cannot find module './budgets'".

- [ ] **Step 3: Implement**

`src/lib/server/repos/budgets.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';

export interface Owner {
  id: string;
  name: string;
}

export interface Budget {
  id: string;
  name: string;
  owner_id: string;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  name: string;
  monthly_limit_cents: number;
}

export interface BudgetCategoryMonth {
  id: string;
  budget_category_id: string;
  month: string;
  amount_cents: number;
}

export async function listOwners(conn: DuckDBConnection): Promise<Owner[]> {
  const reader = await conn.runAndReadAll('SELECT id, name FROM owners ORDER BY name');
  return reader.getRowObjects().map((r) => ({ id: String(r.id), name: String(r.name) }));
}

export async function listBudgets(conn: DuckDBConnection): Promise<Budget[]> {
  const reader = await conn.runAndReadAll('SELECT id, name, owner_id FROM budgets ORDER BY name');
  return reader.getRowObjects().map((r) => ({ id: String(r.id), name: String(r.name), owner_id: String(r.owner_id) }));
}

export async function createBudget(conn: DuckDBConnection, input: { ownerId: string; name: string }): Promise<Budget> {
  const id = randomUUID();
  await conn.run(
    'INSERT INTO budgets (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)',
    [id, input.ownerId, input.name, new Date().toISOString()]
  );
  return { id, name: input.name, owner_id: input.ownerId };
}

export async function listBudgetCategories(conn: DuckDBConnection): Promise<BudgetCategory[]> {
  const reader = await conn.runAndReadAll(
    'SELECT id, budget_id, name, monthly_limit_cents FROM budget_categories ORDER BY name'
  );
  return reader.getRowObjects().map((r) => ({
    id: String(r.id),
    budget_id: String(r.budget_id),
    name: String(r.name),
    monthly_limit_cents: Number(r.monthly_limit_cents)
  }));
}

export async function createBudgetCategory(
  conn: DuckDBConnection,
  input: { budgetId: string; name: string; monthlyLimitCents: number }
): Promise<BudgetCategory> {
  const id = randomUUID();
  await conn.run(
    'INSERT INTO budget_categories (id, budget_id, name, monthly_limit_cents, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, input.budgetId, input.name, input.monthlyLimitCents, new Date().toISOString()]
  );
  return { id, budget_id: input.budgetId, name: input.name, monthly_limit_cents: input.monthlyLimitCents };
}

export async function updateBudgetCategoryLimit(conn: DuckDBConnection, id: string, monthlyLimitCents: number): Promise<void> {
  const current = await ensureBudgetCategoryMonth(conn, id, currentMonth());
  await conn.run('UPDATE budget_categories SET monthly_limit_cents = ? WHERE id = ?', [monthlyLimitCents, id]);
  await conn.run('UPDATE budget_category_months SET amount_cents = ? WHERE id = ?', [monthlyLimitCents, current.id]);
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function ensureBudgetCategoryMonth(
  conn: DuckDBConnection,
  budgetCategoryId: string,
  month: string
): Promise<BudgetCategoryMonth> {
  const existing = await conn.runAndReadAll(
    'SELECT id, budget_category_id, month, amount_cents FROM budget_category_months WHERE budget_category_id = ? AND month = ?',
    [budgetCategoryId, month]
  );
  const rows = existing.getRowObjects();
  if (rows.length > 0) {
    return {
      id: String(rows[0].id),
      budget_category_id: String(rows[0].budget_category_id),
      month: String(rows[0].month),
      amount_cents: Number(rows[0].amount_cents)
    };
  }
  const limit = await conn.runAndReadAll('SELECT monthly_limit_cents FROM budget_categories WHERE id = ?', [budgetCategoryId]);
  const amountCents = limit.getRowObjects().length > 0 ? Number(limit.getRowObjects()[0].monthly_limit_cents) : 0;
  const id = randomUUID();
  await conn.run(
    'INSERT INTO budget_category_months (id, budget_category_id, month, amount_cents) VALUES (?, ?, ?, ?)',
    [id, budgetCategoryId, month, amountCents]
  );
  return { id, budget_category_id: budgetCategoryId, month, amount_cents: amountCents };
}

export async function listBudgetCategoryMonths(conn: DuckDBConnection, month: string): Promise<BudgetCategoryMonth[]> {
  const reader = await conn.runAndReadAll(
    'SELECT id, budget_category_id, month, amount_cents FROM budget_category_months WHERE month = ? ORDER BY amount_cents',
    [month]
  );
  return reader.getRowObjects().map((r) => ({
    id: String(r.id),
    budget_category_id: String(r.budget_category_id),
    month: String(r.month),
    amount_cents: Number(r.amount_cents)
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/repos/budgets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/repos/budgets.ts src/lib/server/repos/budgets.test.ts
git commit -m "feat: add budgets repositories"
```

---

### Task 9: Transactions and rules repositories

**Files:**
- Create: `src/lib/server/repos/transactions.ts`, `src/lib/server/repos/transactions.test.ts`, `src/lib/server/repos/rules.ts`, `src/lib/server/repos/rules.test.ts`

**Interfaces:**
- Produces:
  - `interface Transaction { id: string; accountId: string; externalId: string; postedDate: string; description: string; rawVendorName: string | null; amountCents: number; vendorId: string | null; budgetCategoryMonthId: string | null; assignmentStatus: string; }`
  - `interface TransactionFilters { accountId?: string; month?: string; status?: string; search?: string }`
  - `listTransactions(conn, filters: TransactionFilters): Promise<Transaction[]>`
  - `countUnreviewed(conn): Promise<number>`
  - `getUnreviewed(conn): Promise<Transaction[]>`
  - `assignTransaction(conn, txId: string, budgetCategoryMonthId: string): Promise<void>`
  - `interface Rule { id: string; name: string; descriptionMatcher: string | null; amountOperator: AmountOperator; amountCents: number | null; budgetCategoryId: string; priority: number; enabled: boolean; vendorIds: string[] }`
  - `listRules(conn): Promise<Rule[]>`
  - `createRule(conn, input: { name: string; descriptionMatcher?: string | null; amountOperator?: AmountOperator; amountCents?: number | null; budgetCategoryId: string; priority?: number; vendorIds?: string[] }): Promise<Rule>`
  - `updateRule(conn, id: string, patch: Partial<Rule>): Promise<void>`
  - `deleteRule(conn, id: string): Promise<void>`
  - `moveRule(conn, id: string, direction: 'up' | 'down'): Promise<void>` — swaps `priority` with the adjacent rule in priority order

- [ ] **Step 1: Write the failing tests**

`src/lib/server/repos/transactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { createAccount } from './accounts';
import { createVendor } from './vendors';
import { listOwners, createBudget, createBudgetCategory, ensureBudgetCategoryMonth } from './budgets';
import { listTransactions, countUnreviewed, getUnreviewed, assignTransaction } from './transactions';

async function seedTx(conn: Awaited<ReturnType<typeof createTestDb>>, overrides: Record<string, unknown> = {}) {
  const account = await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
  const vendor = await createVendor(conn, 'Amazon');
  await conn.run(
    `INSERT INTO account_transactions
     (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      overrides.id ?? 'tx1', account.id, overrides.externalId ?? 'e1', overrides.postedDate ?? '2026-07-01',
      overrides.description ?? 'AMZN MKTP US', overrides.rawVendorName ?? 'AMZN MKTP US',
      overrides.amountCents ?? -500, vendor.id, overrides.status ?? 'unreviewed', '2026-07-01'
    ]
  );
  return { account, vendor };
}

describe('transactions repo', () => {
  it('lists transactions and applies filters', async () => {
    const conn = await createTestDb();
    const { account } = await seedTx(conn);
    await seedTx(conn, { id: 'tx2', externalId: 'e2', postedDate: '2026-06-15', description: 'RENT', status: 'auto' });

    const all = await listTransactions(conn, {});
    expect(all).toHaveLength(2);
    const july = await listTransactions(conn, { month: '2026-07' });
    expect(july).toHaveLength(1);
    expect(july[0].id).toBe('tx1');
    const byAccount = await listTransactions(conn, { accountId: account.id });
    expect(byAccount).toHaveLength(2);
    const search = await listTransactions(conn, { search: 'rent' });
    expect(search).toHaveLength(1);
    expect(search[0].id).toBe('tx2');
  });

  it('counts and lists unreviewed transactions', async () => {
    const conn = await createTestDb();
    await seedTx(conn);
    await seedTx(conn, { id: 'tx2', externalId: 'e2', status: 'auto' });
    expect(await countUnreviewed(conn)).toBe(1);
    const unreviewed = await getUnreviewed(conn);
    expect(unreviewed.map((t) => t.id)).toEqual(['tx1']);
  });

  it('assigns a transaction to a budget category month', async () => {
    const conn = await createTestDb();
    await seedTx(conn);
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const cat = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
    const month = await ensureBudgetCategoryMonth(conn, cat.id, '2026-07');

    await assignTransaction(conn, 'tx1', month.id);
    const txs = await listTransactions(conn, {});
    expect(txs[0].budgetCategoryMonthId).toBe(month.id);
    expect(txs[0].assignmentStatus).toBe('manual');
  });
});
```

`src/lib/server/repos/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-helpers';
import { listOwners, createBudget, createBudgetCategory } from './budgets';
import { createVendor } from './vendors';
import { listRules, createRule, updateRule, deleteRule, moveRule } from './rules';

async function makeCategory(conn: Awaited<ReturnType<typeof createTestDb>>) {
  const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
  const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
  return createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
}

describe('rules repo', () => {
  it('creates, lists, updates, and deletes rules', async () => {
    const conn = await createTestDb();
    const cat = await makeCategory(conn);
    const amazon = await createVendor(conn, 'Amazon');

    const rule = await createRule(conn, {
      name: 'Amazon', descriptionMatcher: '^AMZN', amountOperator: 'lt',
      amountCents: 5000, budgetCategoryId: cat.id, priority: 1, vendorIds: [amazon.id]
    });
    expect(rule.vendorIds).toEqual([amazon.id]);

    let rules = await listRules(conn);
    expect(rules).toHaveLength(1);
    expect(rules[0].descriptionMatcher).toBe('^AMZN');

    await updateRule(conn, rule.id, { amountOperator: 'gte', amountCents: 100 });
    rules = await listRules(conn);
    expect(rules[0].amountOperator).toBe('gte');

    await deleteRule(conn, rule.id);
    expect(await listRules(conn)).toHaveLength(0);
  });

  it('moves a rule up or down by swapping priorities', async () => {
    const conn = await createTestDb();
    const cat = await makeCategory(conn);
    const a = await createRule(conn, { name: 'A', budgetCategoryId: cat.id, priority: 1 });
    const b = await createRule(conn, { name: 'B', budgetCategoryId: cat.id, priority: 2 });

    await moveRule(conn, a.id, 'down');
    let rules = await listRules(conn);
    expect(rules.map((r) => r.id)).toEqual([b.id, a.id]);

    await moveRule(conn, a.id, 'up');
    rules = await listRules(conn);
    expect(rules.map((r) => r.id)).toEqual([a.id, b.id]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/repos/transactions.test.ts src/lib/server/repos/rules.test.ts`
Expected: FAIL with "Cannot find module './transactions'".

- [ ] **Step 3: Implement transactions repo**

`src/lib/server/repos/transactions.ts`:

```ts
import type { DuckDBConnection } from '@duckdb/node-api';

export interface Transaction {
  id: string;
  accountId: string;
  externalId: string;
  postedDate: string;
  description: string;
  rawVendorName: string | null;
  amountCents: number;
  vendorId: string | null;
  budgetCategoryMonthId: string | null;
  assignmentStatus: string;
}

export interface TransactionFilters {
  accountId?: string;
  month?: string;
  status?: string;
  search?: string;
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    externalId: String(row.external_id),
    postedDate: String(row.posted_date),
    description: String(row.description),
    rawVendorName: row.raw_vendor_name === null ? null : String(row.raw_vendor_name),
    amountCents: Number(row.amount_cents),
    vendorId: row.vendor_id === null ? null : String(row.vendor_id),
    budgetCategoryMonthId: row.budget_category_month_id === null ? null : String(row.budget_category_month_id),
    assignmentStatus: String(row.assignment_status)
  };
}

export async function listTransactions(conn: DuckDBConnection, filters: TransactionFilters): Promise<Transaction[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.accountId) {
    where.push('account_id = ?');
    params.push(filters.accountId);
  }
  if (filters.month) {
    where.push('substr(posted_date, 1, 7) = ?');
    params.push(filters.month);
  }
  if (filters.status) {
    where.push('assignment_status = ?');
    params.push(filters.status);
  }
  if (filters.search) {
    where.push('lower(description) LIKE lower(?)');
    params.push(`%${filters.search}%`);
  }
  const sql = `SELECT * FROM account_transactions
               ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY posted_date DESC`;
  const reader = await conn.runAndReadAll(sql, params);
  return reader.getRowObjects().map(rowToTransaction);
}

export async function countUnreviewed(conn: DuckDBConnection): Promise<number> {
  const reader = await conn.runAndReadAll(`SELECT count(*) AS n FROM account_transactions WHERE assignment_status = 'unreviewed'`);
  return Number(reader.getRowObjects()[0].n);
}

export async function getUnreviewed(conn: DuckDBConnection): Promise<Transaction[]> {
  return listTransactions(conn, { status: 'unreviewed' });
}

export async function assignTransaction(conn: DuckDBConnection, txId: string, budgetCategoryMonthId: string): Promise<void> {
  await conn.run(
    'UPDATE account_transactions SET budget_category_month_id = ?, assignment_status = ? WHERE id = ?',
    [budgetCategoryMonthId, 'manual', txId]
  );
}
```

- [ ] **Step 4: Implement rules repo**

`src/lib/server/repos/rules.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { AmountOperator } from '$lib/matchers/rules';

export interface Rule {
  id: string;
  name: string;
  descriptionMatcher: string | null;
  amountOperator: AmountOperator;
  amountCents: number | null;
  budgetCategoryId: string;
  priority: number;
  enabled: boolean;
  vendorIds: string[];
}

export interface CreateRuleInput {
  name: string;
  descriptionMatcher?: string | null;
  amountOperator?: AmountOperator;
  amountCents?: number | null;
  budgetCategoryId: string;
  priority?: number;
  vendorIds?: string[];
}

export async function listRules(conn: DuckDBConnection): Promise<Rule[]> {
  const rules = await conn.runAndReadAll(
    `SELECT r.*, rv.vendor_id AS vendor_id
     FROM rules r
     LEFT JOIN rule_vendors rv ON rv.rule_id = r.id
     ORDER BY r.priority, r.name`
  );
  const byId = new Map<string, Rule>();
  for (const row of rules.getRowObjects()) {
    const id = String(row.id);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: String(row.name),
        descriptionMatcher: row.description_matcher === null ? null : String(row.description_matcher),
        amountOperator: row.amount_operator as AmountOperator,
        amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
        budgetCategoryId: String(row.budget_category_id),
        priority: Number(row.priority),
        enabled: Boolean(row.enabled),
        vendorIds: []
      });
    }
    if (row.vendor_id !== null && row.vendor_id !== undefined) {
      byId.get(id)!.vendorIds.push(String(row.vendor_id));
    }
  }
  return [...byId.values()];
}

export async function createRule(conn: DuckDBConnection, input: CreateRuleInput): Promise<Rule> {
  const id = randomUUID();
  const priority = input.priority ?? (await nextPriority(conn));
  await conn.run(
    `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, true)`,
    [id, input.name, input.descriptionMatcher ?? null, input.amountOperator ?? 'any', input.amountCents ?? null, input.budgetCategoryId, priority]
  );
  for (const vendorId of input.vendorIds ?? []) {
    await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?)', [id, vendorId]);
  }
  const rules = await listRules(conn);
  return rules.find((r) => r.id === id)!;
}

export async function updateRule(conn: DuckDBConnection, id: string, patch: Partial<Rule>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if (patch.descriptionMatcher !== undefined) { sets.push('description_matcher = ?'); params.push(patch.descriptionMatcher); }
  if (patch.amountOperator !== undefined) { sets.push('amount_operator = ?'); params.push(patch.amountOperator); }
  if (patch.amountCents !== undefined) { sets.push('amount_cents = ?'); params.push(patch.amountCents); }
  if (patch.budgetCategoryId !== undefined) { sets.push('budget_category_id = ?'); params.push(patch.budgetCategoryId); }
  if (patch.priority !== undefined) { sets.push('priority = ?'); params.push(patch.priority); }
  if (patch.enabled !== undefined) { sets.push('enabled = ?'); params.push(patch.enabled); }
  if (sets.length > 0) {
    params.push(id);
    await conn.run(`UPDATE rules SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  if (patch.vendorIds !== undefined) {
    await conn.run('DELETE FROM rule_vendors WHERE rule_id = ?', [id]);
    for (const vendorId of patch.vendorIds) {
      await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?)', [id, vendorId]);
    }
  }
}

export async function deleteRule(conn: DuckDBConnection, id: string): Promise<void> {
  await conn.run('DELETE FROM rule_vendors WHERE rule_id = ?', [id]);
  await conn.run('DELETE FROM rules WHERE id = ?', [id]);
}

export async function moveRule(conn: DuckDBConnection, id: string, direction: 'up' | 'down'): Promise<void> {
  const current = await conn.runAndReadAll('SELECT id, priority FROM rules WHERE id = ?', [id]);
  const rows = current.getRowObjects();
  if (rows.length === 0) throw new Error(`Rule not found: ${id}`);
  const fromId = String(rows[0].id);
  const from = Number(rows[0].priority);

  const neighbor = direction === 'up'
    ? await conn.runAndReadAll('SELECT id, priority FROM rules WHERE priority < ? ORDER BY priority DESC LIMIT 1', [from])
    : await conn.runAndReadAll('SELECT id, priority FROM rules WHERE priority > ? ORDER BY priority ASC LIMIT 1', [from]);
  const nrows = neighbor.getRowObjects();
  if (nrows.length === 0) return;
  const toId = String(nrows[0].id);
  const to = Number(nrows[0].priority);

  await conn.run('UPDATE rules SET priority = ? WHERE id = ?', [to, fromId]);
  await conn.run('UPDATE rules SET priority = ? WHERE id = ?', [from, toId]);
}

async function nextPriority(conn: DuckDBConnection): Promise<number> {
  const reader = await conn.runAndReadAll('SELECT coalesce(max(priority), -1) + 1 AS next FROM rules');
  return Number(reader.getRowObjects()[0].next);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/repos/transactions.test.ts src/lib/server/repos/rules.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/repos/transactions.ts src/lib/server/repos/transactions.test.ts src/lib/server/repos/rules.ts src/lib/server/repos/rules.test.ts
git commit -m "feat: add transactions and rules repositories"
```

### Task 10: Import and categorization pipeline

**Files:**
- Create: `src/lib/server/importCsv.ts`, `src/lib/server/importCsv.test.ts`

**Interfaces:**
- Produces:
  - `interface ImportResult { imported: number; duplicates: number; errors: string[]; categorized: number }`
  - `importTransactions(conn, accountId: string, rows: ParsedRow[]): Promise<ImportResult>`
  - `categorizeUnreviewed(conn): Promise<number>`

- [ ] **Step 1: Write the failing test**

`src/lib/server/importCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-helpers';
import { createAccount } from './repos/accounts';
import { createVendor } from './repos/vendors';
import { listOwners, createBudget, createBudgetCategory } from './repos/budgets';
import { listTransactions, countUnreviewed } from './repos/transactions';
import { listRules } from './repos/rules';
import { importTransactions, categorizeUnreviewed } from './importCsv';
import type { ParsedRow } from '$lib/parsers';

const rows: ParsedRow[] = [
  { postedDate: '2026-07-01', description: 'AMZN MKTP US', rawVendorName: 'AMZN MKTP US', amountCents: -4567 },
  { postedDate: '2026-07-02', description: 'SHELL OIL', rawVendorName: 'SHELL OIL', amountCents: -3890 }
];

describe('importTransactions', () => {
  it('inserts, dedupes, and resolves vendors', async () => {
    const conn = await createTestDb();
    const account = await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
    await createVendor(conn, 'Amazon', ['AMZN MKTP US']);

    const first = await importTransactions(conn, account.id, rows);
    expect(first.imported).toBe(2);
    expect(first.duplicates).toBe(0);

    const second = await importTransactions(conn, account.id, rows);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(2);

    const txs = await listTransactions(conn, {});
    expect(txs).toHaveLength(2);
    expect(txs[0].vendorId).not.toBeNull();
  });
});

describe('categorizeUnreviewed', () => {
  it('assigns matching transactions by rule priority', async () => {
    const conn = await createTestDb();
    const account = await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const gaming = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
    const general = await createBudgetCategory(conn, { budgetId: budget.id, name: 'General', monthlyLimitCents: 0 });

    await conn.run(
      `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES (?, 'Shell', '^SHELL', 'any', NULL, ?, 1, true), (?, 'Amazon', '^AMZN', 'any', NULL, ?, 2, true)`,
      ['rule-shell', general.id, 'rule-amazon', gaming.id]
    );

    await importTransactions(conn, account.id, rows);
    expect(await countUnreviewed(conn)).toBe(0);

    const txs = await listTransactions(conn, {});
    const amzn = txs.find((t) => t.description === 'AMZN MKTP US')!;
    const shell = txs.find((t) => t.description === 'SHELL OIL')!;

    const assigned = await conn.runAndReadAll(
      `SELECT bcm.budget_category_id FROM account_transactions at
       JOIN budget_category_months bcm ON bcm.id = at.budget_category_month_id
       WHERE at.id IN (?, ?)`,
      [amzn.id, shell.id]
    );
    const categoryIds = assigned.getRowObjects().map((r) => String(r.budget_category_id)).sort();
    expect(categoryIds).toEqual([gaming.id, general.id].sort());
  });

  it('never overwrites auto or manual assignments', async () => {
    const conn = await createTestDb();
    const account = await createAccount(conn, { name: 'CapOne', bank: 'capital_one', type: 'credit' });
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const gaming = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
    await conn.run(
      `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES (?, 'Amazon', '^AMZN', 'any', NULL, ?, 1, true)`,
      ['rule-amazon', gaming.id]
    );

    await importTransactions(conn, account.id, rows);
    expect(await countUnreviewed(conn)).toBe(1);

    const before = (await listTransactions(conn, {})).find((t) => t.description === 'AMZN MKTP US')!;
    expect(before.assignmentStatus).toBe('auto');

    await categorizeUnreviewed(conn);
    const after = (await listTransactions(conn, {})).find((t) => t.description === 'AMZN MKTP US')!;
    expect(after.assignmentStatus).toBe('auto');
  });
});

describe('listRules round-trip', () => {
  it('returns vendorIds with rules', async () => {
    const conn = await createTestDb();
    const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
    const budget = await createBudget(conn, { ownerId: me.id, name: 'Personal' });
    const gaming = await createBudgetCategory(conn, { budgetId: budget.id, name: 'Gaming', monthlyLimitCents: 10000 });
    const amazon = await createVendor(conn, 'Amazon', ['AMZN MKTP US']);
    await conn.run(
      `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
       VALUES (?, 'Amazon', '^AMZN', 'any', NULL, ?, 1, true)`,
      ['rule-amazon', gaming.id]
    );
    await conn.run('INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?)', ['rule-amazon', amazon.id]);
    const rules = await listRules(conn);
    expect(rules[0].vendorIds).toEqual([amazon.id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/importCsv.test.ts`
Expected: FAIL with "Cannot find module './importCsv'".

- [ ] **Step 3: Implement the pipeline**

`src/lib/server/importCsv.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DuckDBConnection } from '@duckdb/node-api';
import { externalId } from '$lib/externalId';
import type { ParsedRow } from '$lib/parsers';
import { resolveVendor } from '$lib/matchers/vendors';
import { firstMatchingRule } from '$lib/matchers/rules';
import { listVendors } from './repos/vendors';
import { listRules } from './repos/rules';
import { ensureBudgetCategoryMonth } from './repos/budgets';

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
  categorized: number;
}

export async function importTransactions(conn: DuckDBConnection, accountId: string, rows: ParsedRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, duplicates: 0, errors: [], categorized: 0 };
  const vendors = await listVendors(conn);

  for (const row of rows) {
    const id = externalId(accountId, row.postedDate, row.description, row.rawVendorName, row.amountCents);
    const exists = await conn.runAndReadAll('SELECT id FROM account_transactions WHERE external_id = ?', [id]);
    if (exists.getRowObjects().length > 0) {
      result.duplicates++;
      continue;
    }
    try {
      const vendorId = resolveVendor(row.rawVendorName, vendors);
      await conn.run(
        `INSERT INTO account_transactions
         (id, account_id, external_id, posted_date, description, raw_vendor_name, amount_cents, vendor_id, assignment_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?)`,
        [randomUUID(), accountId, id, row.postedDate, row.description, row.rawVendorName, row.amountCents, vendorId, new Date().toISOString()]
      );
      result.imported++;
    } catch (err) {
      result.errors.push(`Row "${row.description}" (${row.postedDate}): ${(err as Error).message}`);
    }
  }

  result.categorized = await categorizeUnreviewed(conn);
  return result;
}

export async function categorizeUnreviewed(conn: DuckDBConnection): Promise<number> {
  const rules = (await listRules(conn)).filter((r) => r.enabled);
  const candidates = await conn.runAndReadAll(
    `SELECT id, posted_date, description, amount_cents, vendor_id
     FROM account_transactions WHERE assignment_status = 'unreviewed'`
  );
  let categorized = 0;
  for (const row of candidates.getRowObjects()) {
    const match = firstMatchingRule(rules, {
      description: String(row.description),
      vendorId: row.vendor_id === null ? null : String(row.vendor_id),
      amountCents: Number(row.amount_cents)
    });
    if (!match) continue;
    const month = String(row.posted_date).slice(0, 7);
    const bcm = await ensureBudgetCategoryMonth(conn, match.budgetCategoryId, month);
    await conn.run(
      'UPDATE account_transactions SET budget_category_month_id = ?, assignment_status = ? WHERE id = ?',
      [bcm.id, 'auto', String(row.id)]
    );
    categorized++;
  }
  return categorized;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/importCsv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/importCsv.ts src/lib/server/importCsv.test.ts
git commit -m "feat: add import and categorization pipeline"
```

---

### Task 11: Seed sample data and import CLI scripts

**Files:**
- Create: `scripts/sample-data.ts`, `scripts/import.ts`

**Interfaces:**
- Consumes: `getDb`, repos, `parseBankCsv`, `importTransactions`
- Produces: runnable scripts `npm run sample-data` and `npm run import -- <accountId> <file>`

- [ ] **Step 1: Add the scripts to package.json**

Append to the `scripts` object in `package.json`:

```json
"sample-data": "tsx scripts/sample-data.ts",
"import": "tsx scripts/import.ts"
```

- [ ] **Step 2: Write the sample-data script**

`scripts/sample-data.ts`:

```ts
import { getDb } from '../src/lib/server/db';
import { listOwners, createBudget, createBudgetCategory } from '../src/lib/server/repos/budgets';
import { createVendor } from '../src/lib/server/repos/vendors';
import { createAccount } from '../src/lib/server/repos/accounts';
import { importTransactions } from '../src/lib/server/importCsv';

const conn = await getDb();

async function ensureAccount(name: string, bank: string, type: string) {
  const existing = await conn.runAndReadAll('SELECT id, name FROM accounts WHERE name = ?', [name]);
  const rows = existing.getRowObjects();
  return rows.length > 0
    ? { id: String(rows[0].id), name }
    : createAccount(conn, { name, bank, type });
}

async function ensureBudget(ownerId: string, name: string) {
  const existing = await conn.runAndReadAll('SELECT id FROM budgets WHERE owner_id = ? AND name = ?', [ownerId, name]);
  const rows = existing.getRowObjects();
  return rows.length > 0 ? { id: String(rows[0].id) } : createBudget(conn, { ownerId, name });
}

async function ensureCategory(budgetId: string, name: string, monthlyLimitCents: number) {
  const existing = await conn.runAndReadAll('SELECT id FROM budget_categories WHERE budget_id = ? AND name = ?', [budgetId, name]);
  const rows = existing.getRowObjects();
  return rows.length > 0
    ? { id: String(rows[0].id) }
    : createBudgetCategory(conn, { budgetId, name, monthlyLimitCents });
}

async function ensureVendor(name: string, aliases: string[]) {
  const existing = await conn.runAndReadAll('SELECT id FROM vendors WHERE name = ?', [name]);
  const rows = existing.getRowObjects();
  return rows.length > 0 ? { id: String(rows[0].id) } : createVendor(conn, name, aliases);
}

const capone = await ensureAccount('Capital One Quicksilver', 'capital_one', 'credit');
const bmo = await ensureAccount('BMO Checking', 'bmo', 'debit');

const me = (await listOwners(conn)).find((o) => o.name === 'Me')!;
const family = (await listOwners(conn)).find((o) => o.name === 'Family')!;
const personal = await ensureBudget(me.id, 'Personal');
const familyBudget = await ensureBudget(family.id, 'Household');
const gaming = await ensureCategory(personal.id, 'Gaming', 10000);
const groceries = await ensureCategory(familyBudget.id, 'Groceries', 60000);

const amazon = await ensureVendor('Amazon', ['AMZN MKTP US']);
const shell = await ensureVendor('Shell', ['SHELL OIL']);

await conn.run(
  `INSERT INTO rules (id, name, description_matcher, amount_operator, amount_cents, budget_category_id, priority, enabled)
   VALUES (?, 'Amazon', '^AMZN', 'any', NULL, ?, 1, true), (?, 'Shell', 'SHELL', 'any', NULL, ?, 2, true)
   ON CONFLICT (id) DO NOTHING`,
  ['r-amazon', gaming.id, 'r-shell', groceries.id]
);
await conn.run(
  'INSERT INTO rule_vendors (rule_id, vendor_id) VALUES (?, ?), (?, ?) ON CONFLICT (rule_id, vendor_id) DO NOTHING',
  ['r-amazon', amazon.id, 'r-shell', shell.id]
);

const txns = [
  { postedDate: '2026-07-01', description: 'AMZN MKTP US', rawVendorName: 'AMZN MKTP US', amountCents: -4567 },
  { postedDate: '2026-07-02', description: 'SHELL OIL', rawVendorName: 'SHELL OIL', amountCents: -3890 },
  { postedDate: '2026-07-03', description: 'TRADER JOES #123', rawVendorName: 'TRADER JOES #123', amountCents: -12000 },
  { postedDate: '2026-07-04', description: 'STEAM PURCHASE', rawVendorName: 'STEAM PURCHASE', amountCents: -2999 }
];
await importTransactions(conn, capone.id, txns.slice(0, 3));
await importTransactions(conn, bmo.id, txns.slice(3));

console.log('Sample data seeded.');
console.log('Accounts:', capone.name, 'and', bmo.name);
console.log('Categories: Gaming, Groceries');
```

The script is idempotent: accounts/budgets/categories/vendors are looked up before insert, rules and rule-vendor links use `ON CONFLICT ... DO NOTHING`, and transactions dedupe by `external_id` — running it twice against the same DB is safe.

- [ ] **Step 3: Write the import CLI script**

`scripts/import.ts`:

```ts
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
```

- [ ] **Step 4: Verify the sample-data script runs**

Run: `FINANCE_DB_PATH=/tmp/opencode/finance-sample.db npm run sample-data`
Expected: prints "Sample data seeded." and creates `/tmp/opencode/finance-sample.db`.

Then run it a second time against the same DB:
Run: `FINANCE_DB_PATH=/tmp/opencode/finance-sample.db npm run sample-data`
Expected: still prints "Sample data seeded." with no errors and no duplicate accounts/rules (idempotency check).

- [ ] **Step 5: Verify the import CLI script runs**

First, confirm it fails cleanly when given a bad account id:

Run: `FINANCE_DB_PATH=/tmp/opencode/finance-sample.db npm run import -- not-a-real-id src/lib/parsers/fixtures/capitalOne-sample.csv`
Expected: prints `Account not found: not-a-real-id` and exits 1.

Then get the Capital One account id and import the real fixture:

```bash
FINANCE_DB_PATH=/tmp/opencode/finance-sample.db npx tsx -e "import {getDb} from './src/lib/server/db'; import {listAccounts} from './src/lib/server/repos/accounts'; const c = await getDb(); console.log((await listAccounts(c)).map(a => a.id + ' ' + a.name).join('\n'));"
```

Copy the account id whose name starts with "Capital One", then:

```bash
FINANCE_DB_PATH=/tmp/opencode/finance-sample.db npm run import -- <caponeAccountId> src/lib/parsers/fixtures/capitalOne-sample.csv
```

Expected: prints `Imported 3, duplicates 0, categorized N, parse errors 0`.

- [ ] **Step 6: Commit**

```bash
git add scripts package.json
git commit -m "feat: add sample-data and import CLI scripts"
```

### Task 12: App shell, navigation, and Dashboard

**Files:**
- Create: `src/routes/+layout.svelte` (the minimal template may not include one; create it if missing), `src/routes/+page.server.ts`, `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `getDb`, `ensureBudgetCategoryMonth`, `countUnreviewed`
- Produces: `/` dashboard page rendering spent vs. limit for the current month; nav bar shared by all pages.

- [ ] **Step 1: Write the layout with navigation**

Replace the contents of `src/routes/+layout.svelte` with:

```svelte
<script lang="ts">
  let { children } = $props();

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/review', label: 'Review' },
    { href: '/budgets', label: 'Budgets' },
    { href: '/accounts', label: 'Accounts' },
    { href: '/vendors', label: 'Vendors' },
    { href: '/rules', label: 'Rules' }
  ];
</script>

<nav>
  <ul>
    {#each links as link}
      <li><a href={link.href}>{link.label}</a></li>
    {/each}
  </ul>
</nav>

{@render children()}

<style>
  nav ul {
    display: flex;
    gap: 1rem;
    list-style: none;
    padding: 0;
  }
  body {
    font-family: system-ui, sans-serif;
    max-width: 900px;
    margin: 1rem auto;
    padding: 0 1rem;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 0.25rem 0.5rem;
    text-align: left;
  }
</style>
```

- [ ] **Step 2: Write the dashboard load function**

`src/routes/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { ensureBudgetCategoryMonth } from '$lib/server/repos/budgets';
import { countUnreviewed } from '$lib/server/repos/transactions';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const load: PageServerLoad = async () => {
  const conn = await getDb();
  const month = currentMonth();

  const cats = await conn.runAndReadAll('SELECT id FROM budget_categories');
  for (const row of cats.getRowObjects()) {
    await ensureBudgetCategoryMonth(conn, String(row.id), month);
  }

  const reader = await conn.runAndReadAll(
    `SELECT bcm.id, bcm.amount_cents,
            bc.name AS category_name, b.name AS budget_name, o.name AS owner_name,
            COALESCE(SUM(-at.amount_cents), 0) AS spent_cents
     FROM budget_category_months bcm
     JOIN budget_categories bc ON bc.id = bcm.budget_category_id
     JOIN budgets b ON b.id = bc.budget_id
     JOIN owners o ON o.id = b.owner_id
     LEFT JOIN account_transactions at ON at.budget_category_month_id = bcm.id
     WHERE bcm.month = ?
     GROUP BY bcm.id, bcm.amount_cents, bc.name, b.name, o.name
     ORDER BY spent_cents - bcm.amount_cents DESC`,
    [month]
  );

  const categories = reader.getRowObjects().map((r) => ({
    id: String(r.id),
    categoryName: String(r.category_name),
    budgetName: String(r.budget_name),
    ownerName: String(r.owner_name),
    amountCents: Number(r.amount_cents),
    spentCents: Number(r.spent_cents)
  }));

  const unreviewed = await countUnreviewed(conn);
  const totalLimit = categories.reduce((sum, r) => sum + r.amountCents, 0);
  const totalSpent = categories.reduce((sum, r) => sum + r.spentCents, 0);

  return { month, categories, unreviewed, totalLimit, totalSpent };
};
```

- [ ] **Step 3: Write the dashboard page**

`src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { centsToDollars } from '$lib/money';
  let { data } = $props();
</script>

<h1>Dashboard — {data.month}</h1>

{#if data.unreviewed > 0}
  <p><a href="/review">{data.unreviewed} transaction(s) need review</a></p>
{/if}

<p>Total limit: {centsToDollars(data.totalLimit)} &middot; Total spent: {centsToDollars(data.totalSpent)}</p>

<table>
  <thead>
    <tr>
      <th>Owner</th>
      <th>Budget</th>
      <th>Category</th>
      <th>Spent</th>
      <th>Limit</th>
      <th>Remaining</th>
    </tr>
  </thead>
  <tbody>
    {#each data.categories as cat}
      <tr>
        <td>{cat.ownerName}</td>
        <td>{cat.budgetName}</td>
        <td>{cat.categoryName}</td>
        <td>{centsToDollars(cat.spentCents)}</td>
        <td>{centsToDollars(cat.amountCents)}</td>
        <td>{centsToDollars(cat.amountCents - cat.spentCents)}</td>
      </tr>
    {/each}
  </tbody>
</table>
```

- [ ] **Step 4: Verify the app builds and the dashboard renders**

Run: `npm run check && npm run build`
Then: `FINANCE_DB_PATH=/tmp/opencode/finance-dev.db npm run dev &` and `curl -s http://localhost:5173/ | grep -q Dashboard`
Expected: check and build pass; curl output contains "Dashboard". Stop the dev server after.

- [ ] **Step 5: Commit**

```bash
git add src/routes
git commit -m "feat: add app shell and dashboard"
```

---

### Task 13: Accounts page with CSV import

**Files:**
- Create: `src/routes/accounts/+page.server.ts`, `src/routes/accounts/+page.svelte`
- Create: `src/routes/api/accounts/+server.ts`, `src/routes/api/accounts/[id]/+server.ts`, `src/routes/api/accounts/[id]/import/+server.ts`

**Interfaces:**
- Consumes: `listAccounts`, `createAccount`, `renameAccount`, `getAccount`, `parseBankCsv`, `importTransactions`
- Produces: `/accounts` page (add/rename accounts, upload CSV per account); `POST /api/accounts`, `PATCH /api/accounts/[id]`, `POST /api/accounts/[id]/import`.

- [ ] **Step 1: Write the page load function**

`src/routes/accounts/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listAccounts } from '$lib/server/repos/accounts';

export const load: PageServerLoad = async () => {
  const conn = await getDb();
  return { accounts: await listAccounts(conn) };
};
```

- [ ] **Step 2: Write the API routes**

`src/routes/api/accounts/+server.ts`:

```ts
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
```

`src/routes/api/accounts/[id]/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { renameAccount } from '$lib/server/repos/accounts';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const conn = await getDb();
  await renameAccount(conn, params.id, String(body.name));
  return json({ ok: true });
};
```

`src/routes/api/accounts/[id]/import/+server.ts`:

```ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getAccount } from '$lib/server/repos/accounts';
import { parseBankCsv } from '$lib/parsers';
import { importTransactions } from '$lib/server/importCsv';

export const POST: RequestHandler = async ({ params, request }) => {
  const conn = await getDb();
  const account = await getAccount(conn, params.id);
  if (!account) throw error(404, 'Account not found');

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw error(400, 'No file uploaded');

  const csvText = await file.text();
  let parsed;
  try {
    parsed = parseBankCsv(account.bank, csvText);
  } catch (err) {
    throw error(400, `Could not parse CSV: ${(err as Error).message}`);
  }
  const result = await importTransactions(conn, account.id, parsed.rows);
  return json({ ...result, parseErrors: parsed.errors });
};
```

- [ ] **Step 3: Write the accounts page**

`src/routes/accounts/+page.svelte`:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();

  let name = $state('');
  let bank = $state('capital_one');
  let type = $state('credit');
  let renameFor = $state('');
  let renameName = $state('');

  async function addAccount(e: SubmitEvent) {
    e.preventDefault();
    await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, bank, type })
    });
    name = '';
    invalidateAll();
  }

  async function importCsv(accountId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    await fetch(`/api/accounts/${accountId}/import`, { method: 'POST', body: form });
    invalidateAll();
  }

  function startRename(accountId: string, currentName: string) {
    renameFor = accountId;
    renameName = currentName;
  }

  async function submitRename(e: SubmitEvent) {
    e.preventDefault();
    await fetch(`/api/accounts/${renameFor}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: renameName })
    });
    renameFor = '';
    renameName = '';
    invalidateAll();
  }
</script>

<h1>Accounts</h1>

<form onsubmit={addAccount}>
  <input bind:value={name} placeholder="Name (e.g. Capital One Quicksilver)" />
  <select bind:value={bank}>
    <option value="capital_one">Capital One</option>
    <option value="bmo">BMO</option>
  </select>
  <select bind:value={type}>
    <option value="credit">Credit</option>
    <option value="debit">Debit</option>
  </select>
  <button type="submit">Add account</button>
</form>

{#if data.accounts.length === 0}
  <p>No accounts yet. Add your Capital One or BMO account above.</p>
{/if}

<ul>
  {#each data.accounts as account}
    <li>
      {#if renameFor === account.id}
        <form onsubmit={submitRename}>
          <input bind:value={renameName} />
          <button type="submit">Rename</button>
          <button type="button" onclick={() => (renameFor = '')}>Cancel</button>
        </form>
      {:else}
        <span>{account.name} ({account.bank}, {account.type})</span>
        <button onclick={() => startRename(account.id, account.name)}>Rename</button>
      {/if}
      <input
        type="file"
        accept=".csv"
        onchange={(e) => {
          const file = (e.currentTarget as HTMLInputElement).files?.[0];
          if (file) importCsv(account.id, file);
        }}
      />
    </li>
  {/each}
</ul>
```

- [ ] **Step 4: Verify build and endpoints**

Run: `npm run check && npm run build`
Then start dev (`FINANCE_DB_PATH=/tmp/opencode/finance-dev.db npm run dev &`), create an account, list it, rename it, and import the Capital One fixture:

```bash
curl -s -X POST http://localhost:5173/api/accounts \
  -H 'content-type: application/json' \
  -d '{"name":"CapOne","bank":"capital_one","type":"credit"}'
```

Expected: returns the created account JSON with an `id` (copy it).

```bash
curl -s http://localhost:5173/api/accounts
curl -s -X PATCH http://localhost:5173/api/accounts/<id> \
  -H 'content-type: application/json' \
  -d '{"name":"CapOne Renamed"}'
curl -s -X POST http://localhost:5173/api/accounts/<id>/import -F file=@src/lib/parsers/fixtures/capitalOne-sample.csv
```

Expected: `GET` returns the account list, `PATCH` returns `{"ok":true}`, and the import returns `{"imported":3,"duplicates":0,"errors":[],"categorized":N,"parseErrors":[]}`. Stop the dev server after.

- [ ] **Step 5: Commit**

```bash
git add src/routes/accounts src/routes/api/accounts
git commit -m "feat: add accounts page with csv import"
```

---

### Task 14: Vendors page

**Files:**
- Create: `src/routes/vendors/+page.server.ts`, `src/routes/vendors/+page.svelte`
- Create: `src/routes/api/vendors/+server.ts`, `src/routes/api/vendors/[id]/aliases/+server.ts`, `src/routes/api/vendors/merge/+server.ts`

**Interfaces:**
- Consumes: `listVendors`, `createVendor`, `addVendorAlias`, `mergeVendors`
- Produces: `/vendors` page (create vendor, add alias, merge two vendors); `POST /api/vendors`, `POST /api/vendors/[id]/aliases`, `POST /api/vendors/merge`.

- [ ] **Step 1: Write the page load function**

`src/routes/vendors/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listVendors } from '$lib/server/repos/vendors';

export const load: PageServerLoad = async () => {
  const conn = await getDb();
  return { vendors: await listVendors(conn) };
};
```

- [ ] **Step 2: Write the API routes**

`src/routes/api/vendors/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createVendor } from '$lib/server/repos/vendors';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const conn = await getDb();
  const aliases = Array.isArray(body.aliases) ? body.aliases.map(String) : [];
  const vendor = await createVendor(conn, String(body.name), aliases);
  return json(vendor);
};
```

`src/routes/api/vendors/[id]/aliases/+server.ts`:

```ts
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
```

`src/routes/api/vendors/merge/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { mergeVendors } from '$lib/server/repos/vendors';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const conn = await getDb();
  await mergeVendors(conn, String(body.keepId), String(body.removeId));
  return json({ ok: true });
};
```

- [ ] **Step 3: Write the vendors page**

`src/routes/vendors/+page.svelte`:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();

  let name = $state('');
  let aliases = $state('');
  let newAlias = $state('');
  let aliasForVendor = $state('');
  let keepId = $state('');
  let removeId = $state('');

  async function addVendor(e: SubmitEvent) {
    e.preventDefault();
    const list = aliases.split(',').map((s) => s.trim()).filter(Boolean);
    await fetch('/api/vendors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, aliases: list })
    });
    name = '';
    aliases = '';
    invalidateAll();
  }

  async function addAlias(vendorId: string) {
    await fetch(`/api/vendors/${vendorId}/aliases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newAlias })
    });
    newAlias = '';
    aliasForVendor = '';
    invalidateAll();
  }

  async function merge() {
    await fetch('/api/vendors/merge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keepId, removeId })
    });
    keepId = '';
    removeId = '';
    invalidateAll();
  }
</script>

<h1>Vendors</h1>

<form onsubmit={addVendor}>
  <input bind:value={name} placeholder="Vendor name" />
  <input bind:value={aliases} placeholder="Aliases, comma separated" />
  <button type="submit">Add vendor</button>
</form>

<h2>Merge vendors</h2>
<form onsubmit={(e) => { e.preventDefault(); merge(); }}>
  <select bind:value={keepId}>
    <option value="" disabled>Keep</option>
    {#each data.vendors as v}
      <option value={v.id}>{v.name}</option>
    {/each}
  </select>
  <select bind:value={removeId}>
    <option value="" disabled>Merge into keep</option>
    {#each data.vendors as v}
      <option value={v.id}>{v.name}</option>
    {/each}
  </select>
  <button type="submit">Merge</button>
</form>

<ul>
  {#each data.vendors as vendor}
    <li>
      <strong>{vendor.name}</strong>
      {#if vendor.aliases.length > 0}
        <em>({vendor.aliases.join(', ')})</em>
      {/if}
      <input bind:value={newAlias} placeholder="New alias" onchange={() => (aliasForVendor = vendor.id)} />
      <button onclick={() => addAlias(vendor.id)}>Add alias</button>
    </li>
  {/each}
</ul>
```

- [ ] **Step 4: Verify build**

Run: `npm run check && npm run build`
Expected: check passes, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/routes/vendors src/routes/api/vendors
git commit -m "feat: add vendors page"
```

### Task 15: Rules page

**Files:**
- Create: `src/routes/rules/+page.server.ts`, `src/routes/rules/+page.svelte`
- Create: `src/routes/api/rules/+server.ts`, `src/routes/api/rules/[id]/+server.ts`, `src/routes/api/rules/[id]/test/+server.ts`, `src/routes/api/rules/[id]/move/+server.ts`

**Interfaces:**
- Consumes: `listRules`, `createRule`, `updateRule`, `deleteRule`, `moveRule`, `listBudgetCategories`, `listVendors`, `categorizeUnreviewed`, `ruleMatches`, `isValidRegex`, `RuleSpec`
- Produces: `/rules` page (create/edit/enable/delete/reorder rules, test a rule against a transaction); `POST /api/rules`, `PATCH /api/rules/[id]`, `DELETE /api/rules/[id]`, `POST /api/rules/[id]/test`, `POST /api/rules/[id]/move`.

Regex validation: rule create and update reject a malformed `descriptionMatcher` with `400 Invalid regex: ...`, so a bad pattern can never be saved.

- [ ] **Step 1: Write the page load function**

`src/routes/rules/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listRules } from '$lib/server/repos/rules';
import { listBudgetCategories } from '$lib/server/repos/budgets';
import { listVendors } from '$lib/server/repos/vendors';

export const load: PageServerLoad = async () => {
  const conn = await getDb();
  return {
    rules: await listRules(conn),
    categories: await listBudgetCategories(conn),
    vendors: await listVendors(conn)
  };
};
```

- [ ] **Step 2: Write the API routes**

`src/routes/api/rules/+server.ts`:

```ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createRule } from '$lib/server/repos/rules';
import { categorizeUnreviewed } from '$lib/server/importCsv';
import { isValidRegex } from '$lib/matchers/rules';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const descriptionMatcher = body.descriptionMatcher ? String(body.descriptionMatcher) : null;
  if (descriptionMatcher && !isValidRegex(descriptionMatcher)) {
    throw error(400, `Invalid regex: ${descriptionMatcher}`);
  }
  const conn = await getDb();
  const rule = await createRule(conn, {
    name: String(body.name),
    descriptionMatcher,
    amountOperator: body.amountOperator ?? 'any',
    amountCents: body.amountCents == null ? null : Number(body.amountCents),
    budgetCategoryId: String(body.budgetCategoryId),
    vendorIds: Array.isArray(body.vendorIds) ? body.vendorIds.map(String) : []
  });
  await categorizeUnreviewed(conn);
  return json(rule);
};
```

`src/routes/api/rules/[id]/+server.ts`:

```ts
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
```

`src/routes/api/rules/[id]/test/+server.ts`:

```ts
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
```

`src/routes/api/rules/[id]/move/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { moveRule } from '$lib/server/repos/rules';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const conn = await getDb();
  await moveRule(conn, params.id, body.direction === 'down' ? 'down' : 'up');
  return json({ ok: true });
};
```

- [ ] **Step 3: Write the rules page**

`src/routes/rules/+page.svelte`:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();

  let name = $state('');
  let descriptionMatcher = $state('');
  let amountOperator = $state('any');
  let amountCents = $state('');
  let budgetCategoryId = $state('');
  let selectedVendors = $state([]);

  let editRuleId = $state('');
  let editName = $state('');
  let editDescriptionMatcher = $state('');
  let editAmountOperator = $state('any');
  let editAmountCents = $state('');
  let editBudgetCategoryId = $state('');
  let editVendorIds = $state<string[]>([]);

  let testRuleId = $state('');
  let testDescription = $state('');
  let testVendorId = $state('');
  let testAmount = $state('');
  let testResult = $state<string | null>(null);

  async function addRule(e: SubmitEvent) {
    e.preventDefault();
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        descriptionMatcher: descriptionMatcher || null,
        amountOperator,
        amountCents: amountCents === '' ? null : Math.round(Number(amountCents) * 100),
        budgetCategoryId,
        vendorIds: selectedVendors
      })
    });
    name = '';
    descriptionMatcher = '';
    amountOperator = 'any';
    amountCents = '';
    budgetCategoryId = '';
    selectedVendors = [];
    invalidateAll();
  }

  function startEdit(rule: {
    id: string; name: string; descriptionMatcher: string | null;
    amountOperator: string; amountCents: number | null;
    budgetCategoryId: string; vendorIds: string[]
  }) {
    editRuleId = rule.id;
    editName = rule.name;
    editDescriptionMatcher = rule.descriptionMatcher ?? '';
    editAmountOperator = rule.amountOperator;
    editAmountCents = rule.amountCents == null ? '' : (rule.amountCents / 100).toString();
    editBudgetCategoryId = rule.budgetCategoryId;
    editVendorIds = [...rule.vendorIds];
  }

  async function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    await fetch(`/api/rules/${editRuleId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        descriptionMatcher: editDescriptionMatcher || null,
        amountOperator: editAmountOperator,
        amountCents: editAmountCents === '' ? null : Math.round(Number(editAmountCents) * 100),
        budgetCategoryId: editBudgetCategoryId,
        vendorIds: editVendorIds
      })
    });
    editRuleId = '';
    invalidateAll();
  }

  async function toggle(ruleId: string, enabled: boolean) {
    await fetch(`/api/rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled })
    });
    invalidateAll();
  }

  async function remove(ruleId: string) {
    await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
    invalidateAll();
  }

  async function move(ruleId: string, direction: 'up' | 'down') {
    await fetch(`/api/rules/${ruleId}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction })
    });
    invalidateAll();
  }

  async function testRule(ruleId: string) {
    const res = await fetch(`/api/rules/${ruleId}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        description: testDescription,
        vendorId: testVendorId || null,
        amountCents: testAmount === '' ? 0 : Math.round(Number(testAmount) * 100)
      })
    });
    const body = await res.json();
    testResult = body.matches ? 'MATCHES' : 'no match';
  }
</script>

<h1>Rules</h1>

<form onsubmit={addRule}>
  <input bind:value={name} placeholder="Rule name" />
  <input bind:value={descriptionMatcher} placeholder="Description regex (optional)" />
  <select bind:value={amountOperator}>
    <option value="any">any amount</option>
    <option value="eq">=</option>
    <option value="lt">&lt;</option>
    <option value="lte">&le;</option>
    <option value="gt">&gt;</option>
    <option value="gte">&ge;</option>
  </select>
  <input bind:value={amountCents} placeholder="Amount ($)" type="number" step="0.01" />
  <select bind:value={budgetCategoryId}>
    <option value="" disabled>Target category</option>
    {#each data.categories as cat}
      <option value={cat.id}>{cat.name}</option>
    {/each}
  </select>
  <select bind:value={selectedVendors} multiple>
    {#each data.vendors as v}
      <option value={v.id}>{v.name}</option>
    {/each}
  </select>
  <button type="submit">Add rule</button>
</form>

{#if editRuleId}
  <form onsubmit={saveEdit}>
    <h2>Editing {editName}</h2>
    <input bind:value={editName} placeholder="Rule name" />
    <input bind:value={editDescriptionMatcher} placeholder="Description regex (optional)" />
    <select bind:value={editAmountOperator}>
      <option value="any">any amount</option>
      <option value="eq">=</option>
      <option value="lt">&lt;</option>
      <option value="lte">&le;</option>
      <option value="gt">&gt;</option>
      <option value="gte">&ge;</option>
    </select>
    <input bind:value={editAmountCents} placeholder="Amount ($)" type="number" step="0.01" />
    <select bind:value={editBudgetCategoryId}>
      {#each data.categories as cat}
        <option value={cat.id}>{cat.name}</option>
      {/each}
    </select>
    <select bind:value={editVendorIds} multiple>
      {#each data.vendors as v}
        <option value={v.id}>{v.name}</option>
      {/each}
    </select>
    <button type="submit">Save</button>
    <button type="button" onclick={() => (editRuleId = '')}>Cancel</button>
  </form>
{/if}

<ul>
  {#each data.rules as rule}
    <li>
      <strong>{rule.name}</strong>
      {rule.enabled ? 'on' : 'off'} &middot; priority {rule.priority}
      {#if rule.descriptionMatcher}<code>{rule.descriptionMatcher}</code>{/if}
      <button onclick={() => move(rule.id, 'up')}>&uarr;</button>
      <button onclick={() => move(rule.id, 'down')}>&darr;</button>
      <button onclick={() => startEdit(rule)}>Edit</button>
      <button onclick={() => toggle(rule.id, rule.enabled)}>{rule.enabled ? 'Disable' : 'Enable'}</button>
      <button onclick={() => remove(rule.id)}>Delete</button>

      <details>
        <summary>Test</summary>
        <input bind:value={testDescription} placeholder="Description" />
        <select bind:value={testVendorId}>
          <option value="">no vendor</option>
          {#each data.vendors as v}
            <option value={v.id}>{v.name}</option>
          {/each}
        </select>
        <input bind:value={testAmount} placeholder="Amount ($)" type="number" step="0.01" />
        <button onclick={() => { testRuleId = rule.id; testRule(rule.id); }}>Run test</button>
        {#if testRuleId === rule.id && testResult}<span>{testResult}</span>{/if}
      </details>
    </li>
  {/each}
</ul>
```

- [ ] **Step 4: Verify build and endpoints**

Run: `npm run check && npm run build`
Then start dev (`FINANCE_DB_PATH=/tmp/opencode/finance-dev.db npm run dev &`) and exercise the rules API:

```bash
curl -s -X POST http://localhost:5173/api/rules \
  -H 'content-type: application/json' \
  -d '{"name":"Amazon","descriptionMatcher":"(","budgetCategoryId":"<catId>"}'
```

Expected: returns `400 {"message":"Invalid regex: ("}` — a bad pattern is rejected.

Then create a valid rule (use a category id from the seeded data) and reorder it:

```bash
curl -s -X POST http://localhost:5173/api/rules \
  -H 'content-type: application/json' \
  -d '{"name":"Amazon","descriptionMatcher":"^AMZN","budgetCategoryId":"<catId>"}'
curl -s -X POST http://localhost:5173/api/rules/<ruleId>/move \
  -H 'content-type: application/json' \
  -d '{"direction":"down"}'
```

Expected: creation returns the rule JSON; move returns `{"ok":true}`. Stop the dev server after.

- [ ] **Step 5: Commit**

```bash
git add src/routes/rules src/routes/api/rules
git commit -m "feat: add rules page"
```

---

### Task 16: Budgets page

**Files:**
- Create: `src/routes/budgets/+page.server.ts`, `src/routes/budgets/+page.svelte`
- Create: `src/routes/api/budgets/+server.ts`, `src/routes/api/budgets/[id]/categories/+server.ts`, `src/routes/api/budget-categories/[id]/+server.ts`

**Interfaces:**
- Consumes: `listOwners`, `listBudgets`, `listBudgetCategories`, `createBudget`, `createBudgetCategory`, `updateBudgetCategoryLimit`, `ensureBudgetCategoryMonth`
- Produces: `/budgets` page (add budget under an owner, add category, edit category monthly limit, per-month spent vs. limit); `POST /api/budgets`, `POST /api/budgets/[id]/categories`, `PATCH /api/budget-categories/[id]`.

- [ ] **Step 1: Write the page load function**

`src/routes/budgets/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
  listOwners, listBudgets, listBudgetCategories, ensureBudgetCategoryMonth
} from '$lib/server/repos/budgets';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const load: PageServerLoad = async ({ url }) => {
  const conn = await getDb();
  const month = url.searchParams.get('month') ?? currentMonth();

  const categories = await listBudgetCategories(conn);
  for (const cat of categories) {
    await ensureBudgetCategoryMonth(conn, cat.id, month);
  }

  const reader = await conn.runAndReadAll(
    `SELECT bcm.id, bcm.budget_category_id, bcm.amount_cents,
            bc.name AS category_name, b.name AS budget_name, o.name AS owner_name,
            COALESCE(SUM(-at.amount_cents), 0) AS spent_cents
     FROM budget_category_months bcm
     JOIN budget_categories bc ON bc.id = bcm.budget_category_id
     JOIN budgets b ON b.id = bc.budget_id
     JOIN owners o ON o.id = b.owner_id
     LEFT JOIN account_transactions at ON at.budget_category_month_id = bcm.id
     WHERE bcm.month = ?
     GROUP BY bcm.id, bcm.budget_category_id, bcm.amount_cents, bc.name, b.name, o.name
     ORDER BY o.name, b.name, bc.name`,
    [month]
  );

  return {
    month,
    owners: await listOwners(conn),
    budgets: await listBudgets(conn),
    categories,
    months: reader.getRowObjects().map((r) => ({
      id: String(r.id),
      budgetCategoryId: String(r.budget_category_id),
      amountCents: Number(r.amount_cents),
      spentCents: Number(r.spent_cents),
      categoryName: String(r.category_name),
      budgetName: String(r.budget_name),
      ownerName: String(r.owner_name)
    }))
  };
};
```

- [ ] **Step 2: Write the API routes**

`src/routes/api/budgets/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { createBudget } from '$lib/server/repos/budgets';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const conn = await getDb();
  const budget = await createBudget(conn, { ownerId: String(body.ownerId), name: String(body.name) });
  return json(budget);
};
```

`src/routes/api/budgets/[id]/categories/+server.ts`:

```ts
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
```

`src/routes/api/budget-categories/[id]/+server.ts`:

```ts
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
```

- [ ] **Step 3: Write the budgets page**

`src/routes/budgets/+page.svelte`:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { centsToDollars } from '$lib/money';
  let { data } = $props();

  let ownerId = $state('');
  let budgetName = $state('');
  let categoryBudgetId = $state('');
  let categoryName = $state('');
  let categoryLimit = $state('');
  let month = $state(data.month);

  async function addBudget(e: SubmitEvent) {
    e.preventDefault();
    await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId, name: budgetName })
    });
    budgetName = '';
    invalidateAll();
  }

  async function addCategory(e: SubmitEvent) {
    e.preventDefault();
    await fetch(`/api/budgets/${categoryBudgetId}/categories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: categoryName, monthlyLimitCents: categoryLimit })
    });
    categoryName = '';
    categoryLimit = '';
    invalidateAll();
  }

  async function updateLimit(catId: string, monthlyLimitCents: string) {
    await fetch(`/api/budget-categories/${catId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ monthlyLimitCents })
    });
    invalidateAll();
  }

  function changeMonth() {
    const url = new URL(window.location.href);
    url.searchParams.set('month', month);
    window.location.href = url.toString();
  }
</script>

<h1>Budgets</h1>

<form onsubmit={changeMonth}>
  <input type="month" bind:value={month} />
  <button type="submit">View month</button>
</form>

<h2>Add budget</h2>
<form onsubmit={addBudget}>
  <select bind:value={ownerId}>
    <option value="" disabled>Owner</option>
    {#each data.owners as owner}
      <option value={owner.id}>{owner.name}</option>
    {/each}
  </select>
  <input bind:value={budgetName} placeholder="Budget name" />
  <button type="submit">Add budget</button>
</form>

<h2>Add category</h2>
<form onsubmit={addCategory}>
  <select bind:value={categoryBudgetId}>
    <option value="" disabled>Budget</option>
    {#each data.budgets as budget}
      <option value={budget.id}>{budget.name}</option>
    {/each}
  </select>
  <input bind:value={categoryName} placeholder="Category name" />
  <input bind:value={categoryLimit} placeholder="Monthly limit ($)" type="number" step="0.01" />
  <button type="submit">Add category</button>
</form>

<table>
  <thead>
    <tr>
      <th>Owner</th>
      <th>Budget</th>
      <th>Category</th>
      <th>Spent</th>
      <th>Limit</th>
      <th>Remaining</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#each data.months as m}
      <tr>
        <td>{m.ownerName}</td>
        <td>{m.budgetName}</td>
        <td>{m.categoryName}</td>
        <td>{centsToDollars(m.spentCents)}</td>
        <td>{centsToDollars(m.amountCents)}</td>
        <td>{centsToDollars(m.amountCents - m.spentCents)}</td>
        <td>
          <input
            type="number"
            step="0.01"
            value={centsToDollars(m.amountCents).replace(/[$,]/g, '')}
            onchange={(e) => updateLimit(m.budgetCategoryId, (e.currentTarget as HTMLInputElement).value)}
          />
        </td>
      </tr>
    {/each}
  </tbody>
</table>
```

- [ ] **Step 4: Verify build**

Run: `npm run check && npm run build`
Expected: check passes, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/routes/budgets src/routes/api/budgets src/routes/api/budget-categories
git commit -m "feat: add budgets page"
```

---

### Task 17: Transactions page

**Files:**
- Create: `src/routes/transactions/+page.server.ts`, `src/routes/transactions/+page.svelte`
- Create: `src/routes/api/transactions/[id]/assign/+server.ts`

**Interfaces:**
- Consumes: `listTransactions`, `listAccounts`, `listVendors`, `listBudgetCategories`, `ensureBudgetCategoryMonth`, `assignTransaction`
- Produces: `/transactions` page (filter by account/month/status/search, re-assign a transaction's category via a per-row dropdown); `POST /api/transactions/[id]/assign`.

- [ ] **Step 1: Write the page load function**

`src/routes/transactions/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listTransactions } from '$lib/server/repos/transactions';
import { listAccounts } from '$lib/server/repos/accounts';
import { listVendors } from '$lib/server/repos/vendors';
import { listBudgetCategories } from '$lib/server/repos/budgets';

export const load: PageServerLoad = async ({ url }) => {
  const conn = await getDb();
  const filters = {
    accountId: url.searchParams.get('account') ?? undefined,
    month: url.searchParams.get('month') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    search: url.searchParams.get('search') ?? undefined
  };

  const txs = await listTransactions(conn, filters);
  const accounts = await listAccounts(conn);
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const vendors = new Map((await listVendors(conn)).map((v) => [v.id, v.name]));
  const monthCats = await conn.runAndReadAll(
    `SELECT bcm.id, bc.name AS category_name FROM budget_category_months bcm
     JOIN budget_categories bc ON bc.id = bcm.budget_category_id`
  );
  const categories = new Map(monthCats.getRowObjects().map((r) => [String(r.id), String(r.category_name)]));

  return {
    filters,
    accounts,
    budgetCategories: await listBudgetCategories(conn),
    transactions: txs.map((t) => ({
      ...t,
      accountName: accountNames.get(t.accountId) ?? '?',
      vendorName: t.vendorId ? (vendors.get(t.vendorId) ?? '?') : null,
      categoryName: t.budgetCategoryMonthId ? (categories.get(t.budgetCategoryMonthId) ?? '?') : null
    }))
  };
};
```

- [ ] **Step 2: Write the assign API route**

`src/routes/api/transactions/[id]/assign/+server.ts`:

```ts
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
```

- [ ] **Step 3: Write the transactions page**

`src/routes/transactions/+page.svelte`:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { centsToDollars } from '$lib/money';
  let { data } = $props();

  let account = $state(data.filters.accountId ?? '');
  let month = $state(data.filters.month ?? '');
  let status = $state(data.filters.status ?? '');
  let search = $state(data.filters.search ?? '');

  function applyFilters() {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ account, month, status, search })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.location.href = url.toString();
  }

  async function assign(txId: string, budgetCategoryId: string, txMonth: string) {
    if (!budgetCategoryId) return;
    await fetch(`/api/transactions/${txId}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ budgetCategoryId, month: txMonth })
    });
    invalidateAll();
  }
</script>

<h1>Transactions</h1>

<form onsubmit={(e) => { e.preventDefault(); applyFilters(); }}>
  <input bind:value={search} placeholder="Search description" />
  <input type="month" bind:value={month} />
  <select bind:value={account}>
    <option value="">All accounts</option>
    {#each data.accounts as a}
      <option value={a.id}>{a.name}</option>
    {/each}
  </select>
  <select bind:value={status}>
    <option value="">All statuses</option>
    <option value="unreviewed">unreviewed</option>
    <option value="auto">auto</option>
    <option value="manual">manual</option>
  </select>
  <button type="submit">Filter</button>
</form>

<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Description</th>
      <th>Account</th>
      <th>Vendor</th>
      <th>Amount</th>
      <th>Category</th>
      <th>Status</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#each data.transactions as tx}
      <tr>
        <td>{tx.postedDate}</td>
        <td>{tx.description}</td>
        <td>{tx.accountName}</td>
        <td>{tx.vendorName ?? tx.rawVendorName}</td>
        <td>{centsToDollars(tx.amountCents)}</td>
        <td>{tx.categoryName ?? '—'}</td>
        <td>{tx.assignmentStatus}</td>
        <td>
          <select onchange={(e) => assign(tx.id, (e.currentTarget as HTMLSelectElement).value, tx.postedDate.slice(0, 7))}>
            <option value="">assign category</option>
            {#each data.budgetCategories as cat}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
```

Note: picking a category from a row's dropdown posts to `/api/transactions/[id]/assign` with that transaction's posted month, so it always lands in the correct `budget_category_months` snapshot.

- [ ] **Step 4: Verify build**

Run: `npm run check && npm run build`
Expected: check passes, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/routes/transactions src/routes/api/transactions
git commit -m "feat: add transactions page"
```

---

### Task 18: Review queue page

**Files:**
- Create: `src/routes/review/+page.server.ts`, `src/routes/review/+page.svelte`
- Create: `src/routes/api/review/batch/+server.ts`, `src/routes/api/review/create-rule/+server.ts`

**Interfaces:**
- Consumes: `getUnreviewed`, `listAccounts`, `listVendors`, `listBudgetCategories`, `ensureBudgetCategoryMonth`, `assignTransaction`, `createRule`, `categorizeUnreviewed`
- Produces: `/review` page (batch-assign unreviewed transactions, create a rule from a transaction); `POST /api/review/batch`, `POST /api/review/create-rule`. The batch endpoint derives each transaction's posted month server-side, so a selection spanning multiple months is assigned to each transaction's own month snapshot.

- [ ] **Step 1: Write the page load function**

`src/routes/review/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getUnreviewed } from '$lib/server/repos/transactions';
import { listAccounts } from '$lib/server/repos/accounts';
import { listVendors } from '$lib/server/repos/vendors';
import { listBudgetCategories } from '$lib/server/repos/budgets';

export const load: PageServerLoad = async () => {
  const conn = await getDb();
  const txs = await getUnreviewed(conn);
  const accounts = new Map((await listAccounts(conn)).map((a) => [a.id, a.name]));
  const vendors = await listVendors(conn);
  const vendorNames = new Map(vendors.map((v) => [v.id, v.name]));
  return {
    transactions: txs.map((t) => ({
      ...t,
      accountName: accounts.get(t.accountId) ?? '?',
      vendorName: t.vendorId ? (vendorNames.get(t.vendorId) ?? null) : null
    })),
    vendors,
    categories: await listBudgetCategories(conn)
  };
};
```

- [ ] **Step 2: Write the API routes**

`src/routes/api/review/batch/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { ensureBudgetCategoryMonth } from '$lib/server/repos/budgets';
import { assignTransaction } from '$lib/server/repos/transactions';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const conn = await getDb();
  const budgetCategoryId = String(body.budgetCategoryId);
  for (const txId of body.txIds) {
    const tx = await conn.runAndReadAll('SELECT posted_date FROM account_transactions WHERE id = ?', [String(txId)]);
    const rows = tx.getRowObjects();
    if (rows.length === 0) continue;
    const month = String(rows[0].posted_date).slice(0, 7);
    const bcm = await ensureBudgetCategoryMonth(conn, budgetCategoryId, month);
    await assignTransaction(conn, String(txId), bcm.id);
  }
  return json({ ok: true });
};
```

`src/routes/api/review/create-rule/+server.ts`:

```ts
import { json, error } from '@sveltejs/kit';
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
```

- [ ] **Step 3: Write the review page**

`src/routes/review/+page.svelte`:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { centsToDollars } from '$lib/money';
  let { data } = $props();

  let selected = $state<Set<string>>(new Set());
  let batchCategoryId = $state('');
  let ruleCategoryId = $state('');
  let ruleVendorId = $state('');
  let ruleName = $state('');

  function toggle(txId: string) {
    const next = new Set(selected);
    if (next.has(txId)) next.delete(txId);
    else next.add(txId);
    selected = next;
  }

  async function batchAssign() {
    if (!batchCategoryId || selected.size === 0) return;
    const txIds = [...selected];
    await fetch('/api/review/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txIds, budgetCategoryId: batchCategoryId })
    });
    selected = new Set();
    invalidateAll();
  }

  async function createRuleFrom(tx: { id: string; description: string; vendorId: string | null }) {
    await fetch('/api/review/create-rule', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: ruleName || tx.description.slice(0, 40),
        description: tx.description,
        vendorId: ruleVendorId || tx.vendorId,
        budgetCategoryId: ruleCategoryId
      })
    });
    invalidateAll();
  }
</script>

<h1>Review queue</h1>

{#if data.transactions.length === 0}
  <p>Nothing to review.</p>
{/if}

<form onsubmit={(e) => { e.preventDefault(); batchAssign(); }}>
  <select bind:value={batchCategoryId}>
    <option value="" disabled>Assign selected to category</option>
    {#each data.categories as cat}
      <option value={cat.id}>{cat.name}</option>
    {/each}
  </select>
  <button type="submit" disabled={selected.size === 0}>Assign {selected.size} selected</button>
</form>

<ul>
  {#each data.transactions as tx}
    <li>
      <input type="checkbox" checked={selected.has(tx.id)} onchange={() => toggle(tx.id)} />
      {tx.postedDate} &middot; {centsToDollars(tx.amountCents)} &middot; <strong>{tx.description}</strong>
      ({tx.accountName}{tx.vendorName ? `, ${tx.vendorName}` : ''})

      <details>
        <summary>Create rule</summary>
        <input bind:value={ruleName} placeholder="Rule name" />
        <select bind:value={ruleVendorId}>
          <option value="">No vendor</option>
          {#each data.vendors as v}
            <option value={v.id}>{v.name}</option>
          {/each}
        </select>
        <select bind:value={ruleCategoryId}>
          <option value="" disabled>Category</option>
          {#each data.categories as cat}
            <option value={cat.id}>{cat.name}</option>
          {/each}
        </select>
        <button onclick={() => createRuleFrom(tx)}>Create rule</button>
      </details>
    </li>
  {/each}
</ul>
```

- [ ] **Step 4: Verify build**

Run: `npm run check && npm run build`
Expected: check passes, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/routes/review src/routes/api/review
git commit -m "feat: add review queue page"
```

---

### Task 19: End-to-end verification and final commit

**Files:**
- Modify: `README.md` (only if the commands in it diverge from reality)
- No other source changes expected.

**Interfaces:**
- Consumes: everything built so far.
- Produces: a verified, committed working app.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Type-check and build**

Run: `npm run check && npm run build`
Expected: check passes, build succeeds.

- [ ] **Step 3: Seed sample data into a throwaway DB**

Run: `rm -f /tmp/opencode/finance-e2e.db && FINANCE_DB_PATH=/tmp/opencode/finance-e2e.db npm run sample-data`
Expected: prints "Sample data seeded."

- [ ] **Step 4: Exercise the API end to end with a live server**

Start: `FINANCE_DB_PATH=/tmp/opencode/finance-e2e.db npm run dev &` (note the port, e.g. 5173)

```bash
curl -s http://localhost:5173/ | grep -q Dashboard
curl -s http://localhost:5173/accounts | grep -q Accounts
curl -s http://localhost:5173/budgets | grep -q Budgets
curl -s http://localhost:5173/rules | grep -q Rules
curl -s http://localhost:5173/vendors | grep -q Vendors
curl -s http://localhost:5173/review | grep -q Review
curl -s http://localhost:5173/transactions | grep -q Transactions
```

Expected: every `grep` succeeds (each page returns 200 with the page title).

Then import a real-format CSV through the API. Grab an account id:

```bash
curl -s http://localhost:5173/api/accounts
```

Expected: JSON array containing the sample accounts; copy the Capital One account id.

```bash
curl -s -X POST http://localhost:5173/api/accounts/<id>/import -F file=@src/lib/parsers/fixtures/capitalOne-sample.csv
```

Expected: `{"imported":3,"duplicates":0,"errors":[],"categorized":...,"parseErrors":[]}` — the "PAYMENT THANK YOU" row has no matching rule, so it should stay unreviewed; verify on the dashboard that "transaction(s) need review" appears.

Then exercise the multi-month review path with the seeded data: select one transaction each from two different months in the review queue and batch-assign them to a single category. Confirm each transaction appears under its own month on the Budgets page (verify by checking `budget_category_months.month` matches each transaction's `posted_date` month).

Stop the dev server.

- [ ] **Step 5: Update README if needed**

Read `README.md`. Its "Getting started" and "Importing transactions" sections were written against this design. If any command or path in the README does not match what was actually built, fix it. No speculative additions.

- [ ] **Step 6: Final commit**

```bash
git status
git add -A
git commit -m "chore: finalize finance app"
```






