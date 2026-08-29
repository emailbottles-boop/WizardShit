-- Upgrade for creator-page panels (safe to run on the existing database):
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-panels.sql
CREATE TABLE IF NOT EXISTS panels (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  creator TEXT NOT NULL,            -- credit card name, or "shared" for the projects column
  title   TEXT NOT NULL DEFAULT '',
  url     TEXT NOT NULL DEFAULT '', -- optional link the panel opens
  image   TEXT NOT NULL DEFAULT '', -- optional picture (uploaded via the panel editor)
  visible INTEGER NOT NULL DEFAULT 1,
  sort    INTEGER NOT NULL DEFAULT 0
);
