-- Upgrade for Wizard Shit applications (safe to run on the existing database):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-apply.sql
CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL,
  portfolio  TEXT NOT NULL DEFAULT '',  -- link to their work
  message    TEXT NOT NULL DEFAULT '',
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
