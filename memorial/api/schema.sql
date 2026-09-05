-- Memorial site database (Cloudflare D1).
--
-- Every statement is CREATE ... IF NOT EXISTS, so this file is safe to run
-- against the live database as many times as you like: it adds anything
-- missing and leaves existing rows completely alone. It is never destructive.
--
--   npx wrangler d1 execute memorial --remote --file=schema.sql

-- Uploaded photos. One row per photo; the file itself lives in R2 and `image`
-- is the /img/<key> URL that serves it.
CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  image      TEXT NOT NULL,                  -- /img/<key> URL in R2
  r2_key     TEXT NOT NULL,                  -- the bare R2 key, so delete can find it
  caption    TEXT NOT NULL DEFAULT '',       -- what the photo is / the memory
  uploader   TEXT NOT NULL DEFAULT '',       -- who added it (free text, optional)
  width      INTEGER NOT NULL DEFAULT 0,     -- from the file's own header
  height     INTEGER NOT NULL DEFAULT 0,     -- lets the grid reserve space, no layout jump
  bytes      INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,     -- 1 = removed from the public wall
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The public wall reads "newest visible first" on every load, so index exactly
-- that. Without it D1 scans the whole table once the wall has a few thousand
-- photos on it.
CREATE INDEX IF NOT EXISTS photos_wall ON photos (hidden, id DESC);

-- Editable text on the memorial page (his name, the dates, the few lines at the
-- top). Kept in the database rather than baked into the HTML so it can be
-- changed from the admin panel without a commit or a redeploy.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
