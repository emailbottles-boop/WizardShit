-- Upgrade for Wizard ID claims (safe on the live database):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-claims.sql
CREATE TABLE IF NOT EXISTS claims (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name, email)
);
