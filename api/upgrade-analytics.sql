-- Upgrade for the analytics tab (safe on the existing database):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-analytics.sql
CREATE TABLE IF NOT EXISTS page_hits (
  day  TEXT NOT NULL,
  path TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
