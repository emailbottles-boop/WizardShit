-- Memorial site database (Cloudflare D1).
--
-- Every statement is CREATE ... IF NOT EXISTS, so this file is safe to run
-- against the live database as many times as you like: it adds anything
-- missing and leaves existing rows completely alone. It is never destructive.
--
--   npx wrangler d1 execute memorial --remote --file=schema.sql

-- Everything people upload — photos and recordings — one row each. The file
-- itself lives in R2 and `image` is the /img/<key> URL that serves it (the
-- name predates recordings; the path serves audio just the same).
CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL DEFAULT 'photo',  -- photo | audio
  mime       TEXT NOT NULL DEFAULT '',       -- content type as stored, so playback headers are right
  image      TEXT NOT NULL,                  -- /img/<key> URL in R2
  r2_key     TEXT NOT NULL,                  -- the bare R2 key, so delete can find it
  caption    TEXT NOT NULL DEFAULT '',       -- what it is / the memory; a recording's title
  uploader   TEXT NOT NULL DEFAULT '',       -- who added it (free text, optional)
  photographer TEXT NOT NULL DEFAULT '',     -- who took it, if they said
  width      INTEGER NOT NULL DEFAULT 0,     -- photos: from the file's own header
  height     INTEGER NOT NULL DEFAULT 0,     -- lets the grid reserve space, no layout jump
  duration   REAL    NOT NULL DEFAULT 0,     -- recordings: seconds, as the uploader's browser read it
  bytes      INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,     -- 1 = removed from the public wall
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The public wall reads "newest visible first" on every load, so index exactly
-- that. Without it D1 scans the whole table once the wall has a few thousand
-- photos on it.
CREATE INDEX IF NOT EXISTS photos_wall ON photos (kind, hidden, id DESC);

-- Editable text on the memorial page (his name, the dates, the few lines at the
-- top). Kept in the database rather than baked into the HTML so it can be
-- changed from the admin panel without a commit or a redeploy.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Live updates. Every add, hide, un-hide and delete appends a row here, and an
-- open page asks "what happened after event N?" every few seconds and applies
-- just that — so nobody has to refresh to see a photo someone else added, or
-- to see something the caretaker took down. Rows are tiny and nothing else
-- reads them; a memorial will never have enough events for the growth to
-- matter.
CREATE TABLE IF NOT EXISTS changes (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  kind    TEXT NOT NULL,                       -- add | hide | show | remove
  at      TEXT NOT NULL DEFAULT (datetime('now'))
);
