-- Upgrade for member accounts (safe to run on the existing database):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-accounts.sql
CREATE TABLE IF NOT EXISTS accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL UNIQUE,           -- stored lowercased
  pass_hash  TEXT NOT NULL,                  -- pbkdf2$iters$salt$hash
  email      TEXT NOT NULL DEFAULT '',       -- optional, tied later
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Link a claim to the account that made it. Older email-only claims keep
-- account_id NULL. If the column already exists this ALTER errors harmlessly —
-- run it once; ignore "duplicate column name".
ALTER TABLE claims ADD COLUMN account_id INTEGER;
