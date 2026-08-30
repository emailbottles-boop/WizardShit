-- Upgrade for member roles + the payments ledger (safe to run once):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-hub.sql
-- If "duplicate column name role" appears, that column already exists — ignore.
ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'fan';

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  creator    TEXT NOT NULL,                 -- credit card name
  amount     REAL NOT NULL,                 -- in dollars
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
