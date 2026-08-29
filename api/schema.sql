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
  sort           INTEGER NOT NULL DEFAULT 0
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
