# Quack Multi-Client DB Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a dedicated DuckDB server that owns the database file and serves it over HTTP via the Quack protocol, so the app and CLI tools all connect as concurrent read/write clients and file-lock conflicts disappear.

**Architecture:** A standalone `db-server` process opens `data/finance.db`, applies schema + seed, loads the `quack` extension, and calls `quack_serve`. The app's `getDb()` becomes a Quack client: it opens an in-memory DuckDB, attaches the remote as catalog `fin`, and `USE`s it, so every existing repo query resolves against the remote with no SQL changes. `scripts/sample-data.ts` and `scripts/import.ts` connect through `getDb()` unchanged.

**Tech Stack:** SvelteKit (Svelte 5 runes), `@duckdb/node-api` (bundles DuckDB v1.5.5 with the `quack` core extension), Vitest, TypeScript.

## Global Constraints

- Money is always integer cents (`number`). Never use floats for money.
- Dates are stored as `TEXT` `'YYYY-MM-DD'`; months as `TEXT` `'YYYY-MM'`.
- All database access lives under `src/lib/server/` or inside `src/routes/**/+server.ts` / `+page.server.ts`. Nothing else imports `@duckdb/node-api`. The new `scripts/db-server.ts` imports from `src/lib/server/`, not `@duckdb/node-api` directly where possible.
- Code is written with no explanatory comments.
- Config env: `FINANCE_DB_PATH` (default `data/finance.db`), `QUACK_HOST` (default `127.0.0.1`), `QUACK_PORT` (default `9494`), `QUACK_TOKEN` (default `local-dev`, must be ≥4 chars).
- The client's in-memory `main` catalog must stay empty; schema/seed run only on the server.

---

### Task 1: Quack client + server helpers

**Files:**
- Create: `src/lib/server/quack.ts`
- Test: `src/lib/server/quack.test.ts`

**Interfaces:**
- Produces: `quackUri(): string` and `attachDb(): Promise<DuckDBConnection>` in `src/lib/server/quack.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { quackUri } from './quack';

describe('quackUri', () => {
	const prev = {
		host: process.env.QUACK_HOST,
		port: process.env.QUACK_PORT,
	};

	afterEach(() => {
		process.env.QUACK_HOST = prev.host;
		process.env.QUACK_PORT = prev.port;
	});

	it('defaults to 127.0.0.1:9494', () => {
		delete process.env.QUACK_HOST;
		delete process.env.QUACK_PORT;
		expect(quackUri()).toBe('quack:127.0.0.1:9494');
	});

	it('reads host and port from env', () => {
		process.env.QUACK_HOST = '10.0.0.5';
		process.env.QUACK_PORT = '7777';
		expect(quackUri()).toBe('quack:10.0.0.5:7777');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/quack.test.ts`
Expected: FAIL — module `./quack` has no export `quackUri`.

- [ ] **Step 3: Implement `quackUri`**

Create `src/lib/server/quack.ts`:

```ts
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

export function quackUri(): string {
	const host = process.env.QUACK_HOST ?? '127.0.0.1';
	const port = process.env.QUACK_PORT ?? '9494';
	return `quack:${host}:${port}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/quack.test.ts`
Expected: PASS.

- [ ] **Step 5: Add failing test for `attachDb` (connection to non-running server)**

Append to `src/lib/server/quack.test.ts`:

```ts
import { attachDb } from './quack';

describe('attachDb', () => {
	it('rejects with a connection error when no server is listening', async () => {
		process.env.QUACK_HOST = '127.0.0.1';
		process.env.QUACK_PORT = '9998';
		process.env.QUACK_TOKEN = 'local-dev';
		await expect(attachDb()).rejects.toThrow(/Could not connect|IO Error/);
	});
});
```

- [ ] **Step 6: Run to verify the new test fails**

Run: `npx vitest run src/lib/server/quack.test.ts`
Expected: FAIL — `attachDb` is not defined (TypeError).

- [ ] **Step 7: Implement `attachDb`**

Append to `src/lib/server/quack.ts`:

```ts
export async function attachDb(): Promise<DuckDBConnection> {
	const token = process.env.QUACK_TOKEN ?? 'local-dev';
	const instance = await DuckDBInstance.create(':memory:');
	const conn = await instance.connect();
	await conn.run('INSTALL quack');
	await conn.run('LOAD quack');
	await conn.run(`ATTACH '${quackUri()}' AS fin (TOKEN '${token}')`);
	await conn.run('USE fin');
	return conn;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/quack.test.ts`
Expected: PASS (both `quackUri` cases and the `attachDb` connection-refused case).

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/quack.ts src/lib/server/quack.test.ts
git commit -m "feat: quack client helpers (quackUri, attachDb)"
```

---

### Task 2: Standalone db-server process

**Files:**
- Create: `scripts/db-server.ts`
- Modify: `package.json` (add `db-server` script)
- Test: `scripts/db-server.test.ts`

**Interfaces:**
- Consumes: `getDbPath()` from `../src/lib/server/db`, `SCHEMA_SQL` from `../src/lib/server/schema`, `seedDefaults` from `../src/lib/server/seed`, `quackUri()` from `../src/lib/server/quack`.
- Produces: a `startDbServer(port?: number): Promise<DuckDBConnection>` function (exported for tests) that applies schema+seed, loads quack, serves on `quackUri()`, and returns the server connection.

- [ ] **Step 1: Write the failing test**

Create `scripts/db-server.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDbServer } from './db-server';
import { quackUri } from '../src/lib/server/quack';

describe('db-server', () => {
	let dir: string;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		delete process.env.FINANCE_DB_PATH;
		delete process.env.QUACK_HOST;
		delete process.env.QUACK_PORT;
		delete process.env.QUACK_TOKEN;
	});

	it('serves the DB over quack and applies schema + seed', async () => {
		dir = mkdtempSync(join(tmpdir(), 'dbsrv-'));
		const dbPath = join(dir, 'test.db');
		process.env.FINANCE_DB_PATH = dbPath;
		process.env.QUACK_HOST = '127.0.0.1';
		process.env.QUACK_PORT = '10000';
		process.env.QUACK_TOKEN = 'local-dev';

		const serverConn = await startDbServer();
		try {
			const owners = await serverConn.runAndReadAll('SELECT name FROM owners ORDER BY name');
			expect(owners.getRowObjects().map((r) => r.name)).toEqual(['Family', 'Me', 'Wife']);

			const client = await DuckDBInstance.create(':memory:');
			const cc = await client.connect();
			await cc.run('INSTALL quack');
			await cc.run('LOAD quack');
			await cc.run(`ATTACH '${quackUri()}' AS fin (TOKEN 'local-dev')`);
			await cc.run('USE fin');
			const viaClient = await cc.runAndReadAll('SELECT count(*) AS n FROM owners');
			expect(Number(viaClient.getRowObjects()[0].n)).toBe(3);
		} finally {
			await serverConn.run('CALL quack_stop(?)', [quackUri()]);
			serverConn.closeSync?.();
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/db-server.test.ts`
Expected: FAIL — `startDbServer` is not exported from `./db-server`.

- [ ] **Step 3: Implement `scripts/db-server.ts`**

Create `scripts/db-server.ts`:

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { getDbPath } from '../src/lib/server/db';
import { SCHEMA_SQL } from '../src/lib/server/schema';
import { seedDefaults } from '../src/lib/server/seed';
import { quackUri } from '../src/lib/server/quack';

export async function startDbServer(): Promise<DuckDBConnection> {
	const path = getDbPath();
	mkdirSync(dirname(path), { recursive: true });
	const instance = await DuckDBInstance.create(path);
	const conn = await instance.connect();
	await conn.run(SCHEMA_SQL);
	await seedDefaults(conn);
	await conn.run('INSTALL quack');
	await conn.run('LOAD quack');
	const token = process.env.QUACK_TOKEN ?? 'local-dev';
	const uri = quackUri();
	await conn.run('CALL quack_serve(?, token => ?)', [uri, token]);
	console.log(`Quack server listening on ${uri}`);
	return conn;
}

if (process.argv[1] && process.argv[1].endsWith('db-server.ts')) {
	const conn = await startDbServer();
	const uri = quackUri();
	const shutdown = async () => {
		await conn.run('CALL quack_stop(?)', [uri]);
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
	await new Promise(() => {});
}
```

Note: `conn.closeSync?.()` is used only in the test's `finally`; the type doesn't declare `closeSync` on `DuckDBConnection`, so the optional call avoids a type error. If `check` complains, drop it and rely on the process ending.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/db-server.test.ts`
Expected: PASS — server starts, seed applied, and an external client sees 3 owners.

- [ ] **Step 5: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
"db-server": "tsx scripts/db-server.ts",
```

- [ ] **Step 6: Verify the server starts standalone**

Run:
```bash
rm -f /tmp/opencode/dbserver-check.db
FINANCE_DB_PATH=/tmp/opencode/dbserver-check.db QUACK_PORT=10001 timeout 5 npx tsx scripts/db-server.ts
```
Expected: prints `Quack server listening on quack:127.0.0.1:10001` (timeout kills it; that's fine).

- [ ] **Step 7: Run the full server test suite**

Run: `npx vitest run scripts src/lib/server/quack.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/db-server.ts scripts/db-server.test.ts package.json
git commit -m "feat: standalone quack db-server process"
```

---

### Task 3: Make `getDb()` connect via Quack

**Files:**
- Modify: `src/lib/server/db.ts`
- Test: `src/lib/server/db.test.ts` (add quack integration cases)

**Interfaces:**
- Consumes: `attachDb()` from `./quack`.
- Produces: `getDb(): Promise<DuckDBConnection>` that returns a Quack-attached client connection, cached on `globalThis.__financeDbConnection` as today. `getDbPath()` is unchanged (used by the db-server).

- [ ] **Step 1: Write the failing integration tests**

Append to `src/lib/server/db.test.ts`:

```ts
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDbServer } from '../../scripts/db-server';
import { getDb, getDbPath } from './db';
import { quackUri } from './quack';
import { createAccount } from './repos/accounts';

describe('getDb over quack', () => {
	let dir: string;
	const prevEnv: Record<string, string | undefined> = {};

	function setEnv() {
		prevEnv.FINANCE_DB_PATH = process.env.FINANCE_DB_PATH;
		prevEnv.QUACK_HOST = process.env.QUACK_HOST;
		prevEnv.QUACK_PORT = process.env.QUACK_PORT;
		prevEnv.QUACK_TOKEN = process.env.QUACK_TOKEN;
		process.env.FINANCE_DB_PATH = join(dir, 'test.db');
		process.env.QUACK_HOST = '127.0.0.1';
		process.env.QUACK_PORT = '10002';
		process.env.QUACK_TOKEN = 'local-dev';
	}

	function restoreEnv() {
		for (const [k, v] of Object.entries(prevEnv)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	}

	afterEach(async () => {
		(globalThis as unknown as { __financeDbConnection?: unknown }).__financeDbConnection = undefined;
		restoreEnv();
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('reads and writes through getDb via quack', async () => {
		dir = mkdtempSync(join(tmpdir(), 'dbq-'));
		setEnv();
		const serverConn = await startDbServer();
		try {
			const conn = await getDb();
			const owners = await conn.runAndReadAll('SELECT name FROM owners ORDER BY name');
			expect(owners.getRowObjects().map((r) => r.name)).toEqual(['Family', 'Me', 'Wife']);

			const acct = await createAccount(conn, { name: 'Test', bank: 'bmo', type: 'debit' });
			const back = await conn.runAndReadAll(
				'SELECT name FROM accounts WHERE id = ?',
				[acct.id]
			);
			expect(String(back.getRowObjects()[0].name)).toBe('Test');

			const fresh = await DuckDBInstance.create(':memory:');
			const fc = await fresh.connect();
			await fc.run('INSTALL quack');
			await fc.run('LOAD quack');
			await fc.run(`ATTACH '${quackUri()}' AS fin (TOKEN 'local-dev')`);
			await fc.run('USE fin');
			const n = await fc.runAndReadAll('SELECT count(*) AS n FROM accounts');
			expect(Number(n.getRowObjects()[0].n)).toBe(1);
		} finally {
			await serverConn.run('CALL quack_stop(?)', [quackUri()]);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/db.test.ts`
Expected: the new test FAILS — `getDb()` still opens the file directly, so connecting via `quackUri()` while the server holds the same file hits a lock error (or the `getDb` read sees an empty/unseeded DB).

- [ ] **Step 3: Rewrite `getDb()` as a Quack client**

Replace `src/lib/server/db.ts` contents:

```ts
import type { DuckDBConnection } from '@duckdb/node-api';
import { attachDb } from './quack';

const g = globalThis as unknown as { __financeDbConnection?: DuckDBConnection };

export function getDbPath(): string {
	return process.env.FINANCE_DB_PATH ?? 'data/finance.db';
}

export async function getDb(): Promise<DuckDBConnection> {
	if (g.__financeDbConnection) return g.__financeDbConnection;
	const conn = await attachDb();
	g.__financeDbConnection = conn;
	return conn;
}
```

Note: the client's in-memory `main` catalog stays empty; `SCHEMA_SQL`/`seedDefaults` are no longer imported here (they run in `db-server.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/db.test.ts`
Expected: PASS — existing schema/seed tests still use `createTestDb()` (unchanged) and the new quack integration test passes.

- [ ] **Step 5: Run full server test suite**

Run: `npx vitest run src/lib/server scripts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db.ts src/lib/server/db.test.ts
git commit -m "refactor: getDb connects to DuckDB via quack"
```

---

### Task 4: End-to-end verification + docs

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything from Tasks 1-3.

- [ ] **Step 1: Start the db-server**

Run:
```bash
rm -f /tmp/opencode/finance-quack.db
FINANCE_DB_PATH=/tmp/opencode/finance-quack.db setsid npm run db-server > /tmp/opencode/dbserver.log 2>&1 < /dev/null &
sleep 4
cat /tmp/opencode/dbserver.log
```
Expected: `Quack server listening on quack:127.0.0.1:9494`.

- [ ] **Step 2: Seed sample data through the client**

Run:
```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
FINANCE_DB_PATH=/tmp/opencode/finance-quack.db npm run sample-data
```
Expected: `Sample data seeded.` — this connects via `getDb()` → quack → server.

- [ ] **Step 3: Verify concurrent client from the duckdb CLI**

Run:
```bash
duckdb -c "LOAD quack; ATTACH 'quack:127.0.0.1:9494' AS fin (TOKEN 'local-dev'); USE fin; SELECT count(*) FROM accounts; INSERT INTO owners (id, name) VALUES ('cli-probe', 'CLI');"
```
Expected: `count(*) = 2`, and the insert succeeds.

- [ ] **Step 4: Start the dev server and exercise the app**

Run:
```bash
FINANCE_DB_PATH=/tmp/opencode/finance-quack.db setsid npm run dev > /tmp/opencode/dev.log 2>&1 < /dev/null &
sleep 6
for pair in "/ Dashboard" "/accounts Accounts" "/budgets Budgets" "/rules Rules" "/vendors Vendors" "/review Review" "/transactions Transactions"; do
  path="${pair% *}"; label="${pair#* }"
  curl -s "http://localhost:5173$path" | grep -q "$label" && echo "$path OK" || echo "$path FAIL"
done
```
Expected: every page prints `OK`. Exercise one API write (rename an account) and confirm the CLI client sees it.

- [ ] **Step 5: Run all verification commands**

Run:
```bash
npm run lint && npm run format:check && npm run check && npm run build && npx vitest run
```
Expected: all pass.

- [ ] **Step 6: Update AGENTS.md**

- Add `npm run db-server` to the commands table: "Start the DuckDB Quack server (must be running before the app or CLI scripts)".
- Update the e2e verification flow to start `npm run db-server` first (with `FINANCE_DB_PATH=/tmp/opencode/finance-e2e.db`), then `sample-data`, then the dev server.
- Update "Important gotchas": the single-writer rule now applies to the Quack server process; to inspect data, connect the `duckdb` CLI via `ATTACH 'quack:localhost' AS fin (TOKEN 'local-dev')` instead of opening the file. Note the `at` reserved-word gotcha stays.
- Update the sample-data/import command rows to note the db-server must be running.

- [ ] **Step 7: Stop background processes**

Run:
```bash
pkill -f "db-server.ts"; pkill -f "vite dev"; pkill -f "quack:127.0.0.1:9494"
```
Expected: processes stop; `pgrep -af vite` and `pgrep -af db-server` return nothing.

- [ ] **Step 8: Commit**

```bash
git add AGENTS.md
git commit -m "docs: quack db-server in commands, gotchas, and e2e flow"
```
