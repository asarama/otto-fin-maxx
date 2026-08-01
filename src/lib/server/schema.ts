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
