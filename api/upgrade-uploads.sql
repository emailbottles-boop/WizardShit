-- Upgrade for creator work uploads (safe to run on the existing database):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-uploads.sql
CREATE TABLE IF NOT EXISTS uploads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  creator    TEXT NOT NULL,                 -- credit card name it belongs to
  title      TEXT NOT NULL DEFAULT '',
  image      TEXT NOT NULL,                 -- /img/<key> URL in R2
  status     TEXT NOT NULL DEFAULT 'new',   -- new | seen | verified | paid
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
