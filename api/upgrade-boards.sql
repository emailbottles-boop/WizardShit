-- Board editor fields. Additive, run once on an existing database:
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-boards.sql
-- Fresh databases get these from schema.sql instead; the base table definitions
-- there carry the same columns. SQLite has no "ADD COLUMN IF NOT EXISTS", so run
-- this exactly once — a second run errors on "duplicate column", which is safe
-- to ignore.

-- Per-creator: which department group they belong to, and how their own
-- (individual) board lays out.
ALTER TABLE credits ADD COLUMN board_group TEXT NOT NULL DEFAULT '';
ALTER TABLE credits ADD COLUMN arrangement TEXT NOT NULL DEFAULT 'split';

-- Per-upload: what kind of media the slot holds. The existing `image` column
-- keeps the URL (an /img/<key> in R2 for a real file, or an external link).
ALTER TABLE uploads ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image';

-- Small key/value store for studio-wide settings — e.g. the arrangement of the
-- one public board everyone shares.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('public_arrangement', 'gallery');
