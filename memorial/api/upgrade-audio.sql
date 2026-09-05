-- Adds recordings to a database created BEFORE audio support existed.
--
-- deploy.sh runs these for you, one at a time, and ignores "duplicate column"
-- — which is what a database that already has them says. A fresh database
-- gets these columns from schema.sql and never needs this file.
ALTER TABLE photos ADD COLUMN kind     TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE photos ADD COLUMN mime     TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN duration REAL NOT NULL DEFAULT 0;
