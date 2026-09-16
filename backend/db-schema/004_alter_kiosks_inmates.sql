-- Add uid as primary key to kiosks (kioskId becomes a display/reference field)
ALTER TABLE kiosks ADD COLUMN uid SERIAL;
ALTER TABLE kiosks ADD CONSTRAINT uid_unique UNIQUE (uid);

-- Add cell_id and block_id foreign keys to inmates
ALTER TABLE inmates ADD COLUMN cell_id TEXT;
ALTER TABLE inmates ADD COLUMN block_id TEXT;

-- Migrate existing cellBlock data to cell_id (match by name)
UPDATE inmates i SET cell_id = c.id FROM cells c WHERE i.data->>'cellBlock' = c.name AND i.prison_id = c.prison_id;

-- Migrate existing facility data to block_id (match by name)
UPDATE inmates i SET block_id = b.id FROM blocks b WHERE i.data->>'facility' = b.name AND i.prison_id = b.prison_id;
