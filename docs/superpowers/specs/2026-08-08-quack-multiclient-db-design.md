# Quack Multi-Client DB Access — Design Spec

**Date:** 2026-08-08
**Status:** Approved by user during brainstorming

## Problem

DuckDB allows only a single process to open a database file read-write. When another client (the `duckdb` CLI, a SQL editor, a script) opens `data/finance.db` first, the app's `getDb()` fails with `Could not set lock on file`, and every page/API breaks. An earlier design proposed falling back to read-only mode with a warning banner; the user instead wants proper multi-client access: **the Quack protocol, so multiple clients can read and write concurrently.**

## Goal

Run a dedicated DuckDB server that owns the database file and serves it over HTTP via the Quack extension. Every consumer (the SvelteKit app, the `sample-data` / `import` CLI scripts, the user's `duckdb` CLI) connects to the server as a Quack client. This removes the single-writer file-lock problem entirely: clients never open the file; only the server does.

## Non-Goals

- No read-only fallback / warning banner. Quack natively supports concurrent read+write clients, so the locked-out case no longer applies.
- No auto-spawn or lifecycle management of the server by the app. The server is a separate, independently run process.
- No TLS / reverse proxy. The server binds localhost only (default Quack behavior), which is sufficient for a local single-user app.
- No custom authentication/authorization callbacks. The default token check + permissive authorization are fine for local single-user use.

## Approach

Standalone `db-server` process owns the file and serves it via `quack_serve`. The app's `getDb()` becomes a Quack client that attaches the remote catalog and `USE`s it, so existing repo SQL (unqualified table names, parameterized statements) works unchanged.

## Design

### 1. Server process — `scripts/db-server.ts` (new)

A long-running script, run via `npm run db-server`:

1. `mkdirSync(dirname(path))` and `DuckDBInstance.create(FINANCE_DB_PATH)` (default `data/finance.db`, same env override as today).
2. `conn.run(SCHEMA_SQL)` then `seedDefaults(conn)` — idempotent, same as current `getDb()` does on first open. The server owns schema + seed.
3. `conn.run("INSTALL quack")` / `LOAD quack` (idempotent).
4. `conn.run("CALL quack_serve(?, token => ?)", [uri, token])` where `uri = quackUri()` and `token = QUACK_TOKEN` (default `local-dev`).
5. Log the listen URI and that it's serving.
6. Keep the process alive; on SIGINT/SIGTERM call `quack_stop(uri)` and exit cleanly.

### 2. Client helper — `src/lib/server/quack.ts` (new)

Pure, unit-testable helpers:

- `quackUri(): string` — `quack:` + `QUACK_HOST` (default `127.0.0.1`) + `:` + `QUACK_PORT` (default `9494`). For IPv6 or SSL handling see note below (out of scope; plain localhost).
- `attachDb(): Promise<DuckDBConnection>` — opens an in-memory `DuckDBInstance`, `LOAD quack`, `ATTACH '<uri>' AS fin (TOKEN '<token>')`, `USE fin`, returns the connection.

### 3. App connection — `src/lib/server/db.ts` (modify)

`getDb()` no longer opens the file or runs schema/seed. It becomes:

1. Return the cached global connection if present.
2. `const conn = await attachDb()`.
3. Cache on `globalThis` as today and return.

Important: **do not** run `SCHEMA_SQL` or `seedDefaults` on the client connection — the client's in-memory `main` catalog must stay empty so unqualified table names resolve to the attached `fin` catalog. (Verified: with `USE fin`, unqualified reads and parameterized writes hit the remote.)

Existing repos (`listOwners`, `createAccount`, `importTransactions`, etc.) and all `+page.server.ts` / `+server.ts` code are **unchanged** — they receive a `DuckDBConnection` and their SQL already works unqualified.

### 4. Configuration (env)

| Var | Default | Used by |
|---|---|---|
| `FINANCE_DB_PATH` | `data/finance.db` | server |
| `QUACK_HOST` | `127.0.0.1` | server + client |
| `QUACK_PORT` | `9494` | server + client |
| `QUACK_TOKEN` | `local-dev` | server + client |

### 5. CLI scripts

`scripts/sample-data.ts` and `scripts/import.ts` call `getDb()` already, so they automatically connect via Quack. **No code change**; the server must be running first. AGENTS.md updated accordingly.

### 6. Tests

In `src/lib/server/db.test.ts` (or a sibling `quack.test.ts`):

- **In-process server + client:** start a Quack server in the test process on an ephemeral port against a temp file DB (verified: same-process server + client works). Point `QUACK_HOST`/`QUACK_PORT`/`QUACK_TOKEN`/`FINANCE_DB_PATH` at it, call `getDb()`, assert:
  - reads work (`SELECT` on a seeded table),
  - writes work through a repo function (e.g. `createAccount`), and are visible from a second connection,
  - schema + seed were applied by the server (owners exist).
- **Server not running:** with a port that has no server, `getDb()`/`attachDb()` rejects with a clear connection error.
- Existing `createTestDb()` in-memory tests stay as-is (they don't go through `getDb`).

Note: `db.ts` caches the connection on `globalThis`; tests must reset that cache between cases (existing pattern).

### 7. Docs — AGENTS.md

- Add `npm run db-server` to the commands table: start the DuckDB server (must be running before the app or CLI scripts).
- Update "Important gotchas": the single-writer rule now applies to the Quack server; users connect their own `duckdb` CLI via `ATTACH 'quack:localhost' AS fin (TOKEN 'local-dev')` instead of opening the file directly. The `sample-data` and e2e verification flows gain a `npm run db-server` step.

## Verification

- `npm run lint && npm run format:check && npm run check && npm run build && npx vitest run`.
- Manual: start `npm run db-server`; run `npm run sample-data`; run the dev server; confirm all pages load and the API import/assign flows work; open a second `duckdb` CLI via `ATTACH 'quack:localhost'` and verify concurrent read+write both succeed.
