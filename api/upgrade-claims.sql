-- Upgrade for wizard ID claims (safe to run on the existing database):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-claims.sql
CREATE TABLE IF NOT EXISTS claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_name TEXT NOT NULL,               -- which credit card they clicked
  email       TEXT NOT NULL,               -- the gmail they entered
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | verified | denied
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (credit_name, email)
);
