-- The shop: orders and donations taken on wizardshit.store itself, and the
-- Printful product each merch card sells.
--
-- Safe to run once on the live database:
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-shop.sql
-- If the ALTER errors with "duplicate column name", it has already run.

ALTER TABLE merch_items ADD COLUMN printful_id INTEGER;  -- Printful sync product id; NULL = card stays a link

CREATE TABLE IF NOT EXISTS orders (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  reference             TEXT NOT NULL UNIQUE,            -- WIZ-…, also Printful's external_id
  status                TEXT NOT NULL DEFAULT 'pending_payment',
    -- pending_payment | paid | confirmed | payment_failed | refunded | missing
  email                 TEXT NOT NULL DEFAULT '',
  name                  TEXT NOT NULL DEFAULT '',
  place                 TEXT NOT NULL DEFAULT '',        -- "City, ST, US"
  items                 TEXT NOT NULL DEFAULT '[]',      -- JSON lines: variant, name, option, qty, unit price (cents)
  units                 INTEGER NOT NULL DEFAULT 0,
  subtotal              INTEGER NOT NULL DEFAULT 0,      -- cents
  shipping              INTEGER NOT NULL DEFAULT 0,
  total                 INTEGER NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'USD',
  printful_order_id     INTEGER,
  printful_status       TEXT NOT NULL DEFAULT 'draft',
  stripe_session        TEXT NOT NULL DEFAULT '',
  stripe_payment_intent TEXT NOT NULL DEFAULT '',
  stripe_payout         TEXT NOT NULL DEFAULT '',        -- set once the money reached the bank
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at               TEXT,
  confirmed_at          TEXT
);

CREATE TABLE IF NOT EXISTS donations (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  reference             TEXT NOT NULL UNIQUE,            -- GIFT-…
  status                TEXT NOT NULL DEFAULT 'pending',
    -- pending | paid | paid_out | failed | refunded
  amount                INTEGER NOT NULL,                -- cents
  currency              TEXT NOT NULL DEFAULT 'USD',
  name                  TEXT NOT NULL DEFAULT '',
  email                 TEXT NOT NULL DEFAULT '',
  message               TEXT NOT NULL DEFAULT '',
  public                INTEGER NOT NULL DEFAULT 0,      -- 1 = donor is happy to be thanked by name on the site
  stripe_session        TEXT NOT NULL DEFAULT '',
  stripe_payment_intent TEXT NOT NULL DEFAULT '',
  stripe_payout         TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at               TEXT
);
