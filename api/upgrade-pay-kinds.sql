-- Money a founder records against a creator, as one ledger.
--
-- kind    — 'paid' (money sent), 'deferred' (agreed, pays later), 'iou' (owed).
-- settles — on a 'paid' row, which promise it draws down: '' , 'iou' or 'deferred'.
--
-- Safe to run once on an existing database. Every row that predates this
-- migration takes the defaults ('paid', settling nothing), so "paid to date"
-- is unchanged.
--
--   npx wrangler d1 execute wizardshit --remote --file=upgrade-pay-kinds.sql

ALTER TABLE payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE payments ADD COLUMN settles TEXT NOT NULL DEFAULT '';
