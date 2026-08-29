-- Upgrade for the email-signup list (safe to run on the existing database):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-signups.sql
CREATE TABLE IF NOT EXISTS signups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
