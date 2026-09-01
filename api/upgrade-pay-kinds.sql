-- Adds the kind column to payments, so a creator's page can show money
-- already paid, deferred pay and IOUs as three separate totals.
--
-- Safe to run once on an existing database. Every row that predates this
-- migration takes the 'paid' default, so "paid to date" is unchanged.
--
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-pay-kinds.sql

ALTER TABLE payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'paid';
