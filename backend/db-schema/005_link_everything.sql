-- 005: bind every record to its jail with real foreign keys.
--
-- What this fixes:
--   * four pointer columns had no foreign key at all (inmates.cell_id,
--     inmates.block_id, calls.room_id, wallet_requests.inmate_id) so rows
--     could outlive their target - production already had 27 calls whose
--     room_id pointed at a room that never existed;
--   * admins / devices / contacts only carried their jail inside the JSONB
--     document, invisible to SQL joins and unenforceable by the database;
--   * prisons.wardenIds / kioskIds were written once at registration and
--     never maintained, so the arrays drifted from the rows that exist;
--   * setup_pins and kiosk_registration_requests were seed-only leftovers -
--     the runtime reads setup pins from prisons.setupPin and registration
--     requests from the kiosk rows themselves.

-- ---------------------------------------------------------------------------
-- 1. Pointer columns that only existed in the JSONB document.
-- ---------------------------------------------------------------------------
ALTER TABLE admins    ADD COLUMN kiosk_id  TEXT;
ALTER TABLE admins    ADD COLUMN prison_id TEXT;
ALTER TABLE devices   ADD COLUMN kiosk_id  TEXT;
ALTER TABLE devices   ADD COLUMN prison_id TEXT;
ALTER TABLE contacts  ADD COLUMN prison_id TEXT;

-- ---------------------------------------------------------------------------
-- 2. Rooms for the calls that minted a roomId without ever creating the room
--    row (calls.js used to generate the id inline). Historical rows get
--    status 'closed' - the call is over, the room is kept so the call keeps
--    something to point at.
-- ---------------------------------------------------------------------------
INSERT INTO rooms (id, kiosk_id, inmate_id, contact_id, status, data)
SELECT DISTINCT ON (c.room_id)
       c.room_id, c.kiosk_id, c.inmate_id, c.contact_id, 'closed',
       jsonb_build_object(
         'roomId',           c.room_id,
         'kioskId',          c.kiosk_id,
         'inmateId',         c.inmate_id,
         'contactId',        c.contact_id,
         'status',           'closed',
         'participants',     '[]'::jsonb,
         'participantCount', 0,
         'createdAt',        COALESCE(c.data -> 'startTime', to_jsonb(now()::text))
       )
FROM calls c
WHERE c.room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.id = c.room_id);

-- ---------------------------------------------------------------------------
-- 3. Null out every pointer whose target row is already gone, so the foreign
--    keys below can be added and can never fire on existing data.
-- ---------------------------------------------------------------------------
UPDATE inmates        SET cell_id   = NULL WHERE cell_id   IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM cells  x WHERE x.id = inmates.cell_id);
UPDATE inmates        SET block_id  = NULL WHERE block_id  IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM blocks x WHERE x.id = inmates.block_id);
UPDATE calls          SET room_id   = NULL WHERE room_id   IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM rooms  x WHERE x.id = calls.room_id);
UPDATE wallet_requests SET inmate_id = NULL WHERE inmate_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM inmates x WHERE x.id = wallet_requests.inmate_id);

-- ---------------------------------------------------------------------------
-- 4. Backfill every *_id column from the document, but only when the target
--    row really exists: a stale document value must never reach a foreign key.
-- ---------------------------------------------------------------------------
DO $$
DECLARE pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('wardens',       'prisonId',       'prison_id',  'prisons'),
      ('users',         'prisonId',       'prison_id',  'prisons'),
      ('users',         'kioskId',        'kiosk_id',   'kiosks'),
      ('inmates',       'prisonId',       'prison_id',  'prisons'),
      ('inmates',       'assignedKioskId','kiosk_id',   'kiosks'),
      ('inmates',       'cellId',         'cell_id',    'cells'),
      ('inmates',       'blockId',        'block_id',   'blocks'),
      ('kiosks',        'prisonId',       'prison_id',  'prisons'),
      ('contacts',      'inmateId',       'inmate_id',  'inmates'),
      ('contacts',      'prisonId',       'prison_id',  'prisons'),
      ('rooms',         'kioskId',        'kiosk_id',   'kiosks'),
      ('rooms',         'inmateId',       'inmate_id',  'inmates'),
      ('rooms',         'contactId',      'contact_id', 'contacts'),
      ('calls',         'roomId',         'room_id',    'rooms'),
      ('calls',         'inmateId',       'inmate_id',  'inmates'),
      ('calls',         'contactId',      'contact_id', 'contacts'),
      ('calls',         'kioskId',        'kiosk_id',   'kiosks'),
      ('calls',         'prisonId',       'prison_id',  'prisons'),
      ('recordings',    'callId',         'call_id',    'calls'),
      ('recordings',    'kioskId',        'kiosk_id',   'kiosks'),
      ('recordings',    'inmateId',       'inmate_id',  'inmates'),
      ('schedule',      'inmateId',       'inmate_id',  'inmates'),
      ('schedule',      'contactId',      'contact_id', 'contacts'),
      ('schedule',      'kioskId',        'kiosk_id',   'kiosks'),
      ('wallets',       'inmateId',       'inmate_id',  'inmates'),
      ('transactions',  'walletId',       'wallet_id',  'wallets'),
      ('transactions',  'inmateId',       'inmate_id',  'inmates'),
      ('transactions',  'callId',         'call_id',    'calls'),
      ('wallet_requests','inmateId',      'inmate_id',  'inmates'),
      ('alerts',        'prisonId',       'prison_id',  'prisons'),
      ('alerts',        'kioskId',        'kiosk_id',   'kiosks'),
      ('alerts',        'callId',         'call_id',    'calls'),
      ('incidents',     'prisonId',       'prison_id',  'prisons'),
      ('incidents',     'inmateId',       'inmate_id',  'inmates'),
      ('incidents',     'kioskId',        'kiosk_id',   'kiosks'),
      ('incidents',     'callId',         'call_id',    'calls'),
      ('incidents',     'wardenId',       'warden_id',  'wardens'),
      ('biometrics',    'inmateId',       'inmate_id',  'inmates'),
      ('statistics',    'callId',         'call_id',    'calls'),
      ('reports',       'prisonId',       'prison_id',  'prisons'),
      ('subscriptions', 'prisonId',       'prison_id',  'prisons'),
      ('admins',        'kioskId',        'kiosk_id',   'kiosks'),
      ('admins',        'prisonId',       'prison_id',  'prisons'),
      ('devices',       'kioskId',        'kiosk_id',   'kiosks'),
      ('devices',       'prisonId',       'prison_id',  'prisons')
    ) AS t(tbl, doc_key, col, parent)
  LOOP
    EXECUTE format(
      'UPDATE %I t SET %I = t.data ->> %L
        WHERE t.%I IS NULL AND t.data ->> %L IS NOT NULL
          AND EXISTS (SELECT 1 FROM %I p WHERE p.id = t.data ->> %L)',
      pair.tbl, pair.col, pair.doc_key, pair.col, pair.doc_key,
      pair.parent, pair.doc_key
    );
  END LOOP;
END $$;

-- Devices keep their kiosk id in `name` ("KIOSK-001"), never in a kioskId key.
UPDATE devices d SET kiosk_id = k.id
  FROM kiosks k WHERE d.kiosk_id IS NULL AND d.data ->> 'name' = k.id;
UPDATE devices d SET prison_id = k.prison_id
  FROM kiosks k WHERE d.prison_id IS NULL AND d.kiosk_id = k.id AND k.prison_id IS NOT NULL;
-- An admin without a document prisonId inherits it from its kiosk.
UPDATE admins a SET prison_id = k.prison_id
  FROM kiosks k WHERE a.prison_id IS NULL AND a.kiosk_id = k.id AND k.prison_id IS NOT NULL;
UPDATE contacts c SET prison_id = i.prison_id
  FROM inmates i WHERE c.prison_id IS NULL AND c.inmate_id = i.id AND i.prison_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. The foreign keys that were missing.
-- ---------------------------------------------------------------------------
ALTER TABLE inmates        ADD CONSTRAINT fk_inmates_cell
  FOREIGN KEY (cell_id)   REFERENCES cells(id)   ON DELETE SET NULL;
ALTER TABLE inmates        ADD CONSTRAINT fk_inmates_block
  FOREIGN KEY (block_id)  REFERENCES blocks(id)  ON DELETE SET NULL;
ALTER TABLE calls          ADD CONSTRAINT fk_calls_room
  FOREIGN KEY (room_id)   REFERENCES rooms(id)   ON DELETE SET NULL;
ALTER TABLE wallet_requests ADD CONSTRAINT fk_wallet_requests_inmate
  FOREIGN KEY (inmate_id) REFERENCES inmates(id) ON DELETE CASCADE;

ALTER TABLE admins         ADD CONSTRAINT fk_admins_kiosk
  FOREIGN KEY (kiosk_id)  REFERENCES kiosks(id)  ON DELETE CASCADE;
ALTER TABLE admins         ADD CONSTRAINT fk_admins_prison
  FOREIGN KEY (prison_id) REFERENCES prisons(id) ON DELETE CASCADE;
ALTER TABLE devices        ADD CONSTRAINT fk_devices_kiosk
  FOREIGN KEY (kiosk_id)  REFERENCES kiosks(id)  ON DELETE SET NULL;
ALTER TABLE devices        ADD CONSTRAINT fk_devices_prison
  FOREIGN KEY (prison_id) REFERENCES prisons(id) ON DELETE SET NULL;
ALTER TABLE contacts       ADD CONSTRAINT fk_contacts_prison
  FOREIGN KEY (prison_id) REFERENCES prisons(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. Indexes for the new columns and the uniqueness rules the application
--    already assumes (both verified empty of duplicates before this runs).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_admins_kiosk     ON admins (kiosk_id);
CREATE INDEX IF NOT EXISTS ix_admins_prison    ON admins (prison_id);
CREATE INDEX IF NOT EXISTS ix_devices_kiosk    ON devices (kiosk_id);
CREATE INDEX IF NOT EXISTS ix_devices_prison   ON devices (prison_id);
CREATE INDEX IF NOT EXISTS ix_contacts_prison  ON contacts (prison_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admins_email
  ON admins (lower((data ->> 'email'))) WHERE data ->> 'email' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inmates_prisoner
  ON inmates (lower((data ->> 'prisonerNumber'))) WHERE data ->> 'prisonerNumber' IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Rebuild the membership arrays from the rows that actually exist: they
--    were written once at registration and nothing ever kept them in sync.
-- ---------------------------------------------------------------------------
UPDATE prisons p SET data = jsonb_set(p.data, '{wardenIds}', COALESCE((
  SELECT jsonb_agg(w.id ORDER BY w.created_at) FROM wardens w WHERE w.prison_id = p.id
), '[]'::jsonb));
UPDATE prisons p SET data = jsonb_set(p.data, '{kioskIds}', COALESCE((
  SELECT jsonb_agg(k.id ORDER BY k.uid) FROM kiosks k WHERE k.prison_id = p.id
), '[]'::jsonb));

-- ---------------------------------------------------------------------------
-- 8. Drop the seed-only tables. The runtime stores the setup PIN on the
--    prison document (prisons.setupPin) and reads registration requests from
--    the kiosk rows themselves.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS setup_pins;
DROP TABLE IF EXISTS kiosk_registration_requests;
