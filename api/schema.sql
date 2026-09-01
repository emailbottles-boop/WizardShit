-- Wizard Shit backend schema (D1 / SQLite)
-- Apply with: npx wrangler d1 execute wizardshit --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS merch_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  title     TEXT NOT NULL,
  url       TEXT NOT NULL,            -- Printful product link
  image     TEXT NOT NULL,            -- site-relative path or absolute URL
  sticker   INTEGER NOT NULL DEFAULT 0, -- 1 = render with the round sticker thumb style
  row_break INTEGER NOT NULL DEFAULT 0, -- 1 = start a new grid row before this item
  visible   INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS credits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  roles          TEXT NOT NULL DEFAULT '',  -- one role per line
  photo          TEXT NOT NULL DEFAULT '',  -- site-relative path or absolute URL
  photo_css      TEXT NOT NULL DEFAULT '',  -- extra CSS for the photo, e.g. "background-position: center 70%;"
  back_text      TEXT NOT NULL DEFAULT '',  -- bio paragraph or quote on the card back
  back_quote     INTEGER NOT NULL DEFAULT 0, -- 1 = italic quote style
  back_show_name INTEGER NOT NULL DEFAULT 0, -- 1 = repeat the name on the card back
  visible        INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0,
  board_group    TEXT NOT NULL DEFAULT '',       -- department group for the board editor
  arrangement    TEXT NOT NULL DEFAULT 'split'   -- how this creator's own board lays out
);

CREATE TABLE IF NOT EXISTS donators (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS page_hits (
  day  TEXT NOT NULL,
  path TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

CREATE TABLE IF NOT EXISTS signups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS panels (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  creator TEXT NOT NULL,            -- credit card name, or "shared" for the projects column
  title   TEXT NOT NULL DEFAULT '',
  url     TEXT NOT NULL DEFAULT '', -- optional link the panel opens
  image   TEXT NOT NULL DEFAULT '', -- optional picture (uploaded via the panel editor)
  visible INTEGER NOT NULL DEFAULT 1,
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL,
  portfolio  TEXT NOT NULL DEFAULT '',  -- link to their work
  message    TEXT NOT NULL DEFAULT '',
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uploads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  creator    TEXT NOT NULL,                 -- credit card name it belongs to
  title      TEXT NOT NULL DEFAULT '',
  image      TEXT NOT NULL,                 -- /img/<key> URL in R2, or an external link
  status     TEXT NOT NULL DEFAULT 'new',   -- new | seen | verified | paid
  media_type TEXT NOT NULL DEFAULT 'image', -- image | video | music | link | file
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Studio-wide settings (key/value). Holds e.g. the public board's arrangement.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL UNIQUE,           -- stored lowercased
  pass_hash  TEXT NOT NULL,                  -- pbkdf2$iters$salt$hash
  email      TEXT NOT NULL DEFAULT '',       -- optional, tied later
  role       TEXT NOT NULL DEFAULT 'fan',    -- fan | applicant | crew (self-selected funnel)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Money a founder records against a creator; shown in that creator's hub.
-- One row per entry, so the three figures on a creator's page are sums by
-- kind rather than counters that can drift:
--   paid     — money already sent, the running "paid to date" total
--   deferred — agreed work that pays out later
--   iou      — an informal debt, not yet scheduled
-- 'paid' is the default so every row written before kinds existed keeps
-- counting as a real payment.
CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  creator    TEXT NOT NULL,                 -- credit card name
  amount     REAL NOT NULL,                 -- in dollars
  note       TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'paid',  -- paid | deferred | iou
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_name TEXT NOT NULL,               -- which credit card they clicked
  email       TEXT NOT NULL,               -- the gmail on the claim
  account_id  INTEGER,                     -- the member account that claimed it
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | verified | denied
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (credit_name, email)
);
