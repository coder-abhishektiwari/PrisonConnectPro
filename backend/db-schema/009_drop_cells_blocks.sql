-- 008: cells/blocks are dead — drop them.
--
-- Migration 007 already removed Cell/Block (and everything derived from them)
-- from the inmate record: the fields were free text plus the cell_id/block_id
-- foreign keys below. No UI, route consumer or kiosk read ever read the two
-- tables again, so the leftover rows were pure dead weight. Drop the
-- constraints first (an FK would block the table drop), then the columns,
-- then the tables.
ALTER TABLE inmates DROP CONSTRAINT IF EXISTS fk_inmates_cell;
ALTER TABLE inmates DROP CONSTRAINT IF EXISTS fk_inmates_block;
ALTER TABLE inmates DROP COLUMN IF EXISTS cell_id;
ALTER TABLE inmates DROP COLUMN IF EXISTS block_id;
DROP TABLE IF EXISTS cells;
DROP TABLE IF EXISTS blocks;
