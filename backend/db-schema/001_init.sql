-- PrisonConnect core schema (PostgreSQL 16).
-- Each collection keeps its full original document in a `data` JSONB column so the
-- API layer can round-trip records unchanged; relational key columns are kept in
-- sync by the data-access layer to give us real foreign keys, indexes and
-- uniqueness constraints.
--
-- Naming: every table uses `id TEXT PRIMARY KEY` (the application's stable entity
-- id, e.g. "WARDEN-xxx", "CALL-xxx", "INM-xxx").

-- ============ PRISONS ============
CREATE TABLE prisons (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  status        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uq_prisons_name ON prisons (name) WHERE name IS NOT NULL;
CREATE INDEX ix_prisons_status ON prisons (status);

-- ============ WARDENS ============
CREATE TABLE wardens (
  id            TEXT PRIMARY KEY,
  email         TEXT,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uq_wardens_email ON wardens (email) WHERE email IS NOT NULL;
CREATE INDEX ix_wardens_prison ON wardens (prison_id);

-- ============ KIOSKS ============
CREATE TABLE kiosks (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE CASCADE,
  serial        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uq_kiosks_serial ON kiosks (serial) WHERE serial IS NOT NULL;
CREATE INDEX ix_kiosks_prison ON kiosks (prison_id);

-- ============ USERS (kiosk / vendor operator accounts) ============
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT,
  email         TEXT,
  kiosk_id      TEXT REFERENCES kiosks(id) ON DELETE SET NULL,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uq_users_username ON users (username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX uq_users_email ON users (email) WHERE email IS NOT NULL;
CREATE INDEX ix_users_kiosk ON users (kiosk_id);

-- ============ INMATES ============
CREATE TABLE inmates (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE CASCADE,
  kiosk_id      TEXT REFERENCES kiosks(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_inmates_prison ON inmates (prison_id);
CREATE INDEX ix_inmates_kiosk ON inmates (kiosk_id);

-- ============ CONTACTS (approved family members) ============
CREATE TABLE contacts (
  id            TEXT PRIMARY KEY,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_contacts_inmate ON contacts (inmate_id);

-- ============ ROOMS ============
CREATE TABLE rooms (
  id            TEXT PRIMARY KEY,
  kiosk_id      TEXT REFERENCES kiosks(id) ON DELETE SET NULL,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE SET NULL,
  contact_id    TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  status        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_rooms_kiosk ON rooms (kiosk_id);
CREATE INDEX ix_rooms_status ON rooms (status);

-- ============ CALLS ============
CREATE TABLE calls (
  id            TEXT PRIMARY KEY,
  room_id       TEXT,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE SET NULL,
  contact_id    TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  kiosk_id      TEXT REFERENCES kiosks(id) ON DELETE SET NULL,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE SET NULL,
  status        TEXT,
  start_time    TIMESTAMPTZ,
  end_time      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_calls_status ON calls (status);
CREATE INDEX ix_calls_inmate ON calls (inmate_id);
CREATE INDEX ix_calls_prison ON calls (prison_id);
CREATE INDEX ix_calls_start ON calls (start_time);
-- Business rule enforced at the database: an inmate may have at most one ACTIVE call.
CREATE UNIQUE INDEX uq_active_call_per_inmate ON calls (inmate_id) WHERE status = 'active';

-- ============ RECORDINGS ============
CREATE TABLE recordings (
  id            TEXT PRIMARY KEY,
  call_id       TEXT REFERENCES calls(id) ON DELETE CASCADE,
  kiosk_id      TEXT REFERENCES kiosks(id) ON DELETE SET NULL,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_recordings_call ON recordings (call_id);

-- ============ WALLETS ============
CREATE TABLE wallets (
  id            TEXT PRIMARY KEY,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uq_wallets_inmate ON wallets (inmate_id);

-- ============ TRANSACTIONS ============
CREATE TABLE transactions (
  id            TEXT PRIMARY KEY,
  wallet_id     TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE SET NULL,
  call_id       TEXT REFERENCES calls(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_transactions_wallet ON transactions (wallet_id);
CREATE INDEX ix_transactions_inmate ON transactions (inmate_id);

-- ============ SCHEDULE (bookable visit slots) ============
CREATE TABLE schedule (
  id            TEXT PRIMARY KEY,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE SET NULL,
  contact_id    TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  kiosk_id      TEXT REFERENCES kiosks(id) ON DELETE SET NULL,
  date          TEXT,
  time_slot     TEXT,
  status        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_schedule_inmate ON schedule (inmate_id);
CREATE INDEX ix_schedule_status ON schedule (status);

-- ============ ALERTS / INCIDENTS ============
CREATE TABLE alerts (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE SET NULL,
  kiosk_id      TEXT REFERENCES kiosks(id) ON DELETE SET NULL,
  call_id       TEXT REFERENCES calls(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_alerts_prison ON alerts (prison_id);

CREATE TABLE incidents (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE SET NULL,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE SET NULL,
  kiosk_id      TEXT REFERENCES kiosks(id) ON DELETE SET NULL,
  call_id       TEXT REFERENCES calls(id) ON DELETE SET NULL,
  warden_id     TEXT REFERENCES wardens(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_incidents_prison ON incidents (prison_id);

-- ============ AUXILIARY COLLECTIONS ============
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE kiosk_registration_requests (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE statistics (
  id            TEXT PRIMARY KEY,
  call_id       TEXT REFERENCES calls(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_statistics_call ON statistics (call_id);

CREATE TABLE admins (
  id            TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE super_admins (
  id            TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE biometrics (
  id            TEXT PRIMARY KEY,
  inmate_id     TEXT REFERENCES inmates(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_biometrics_inmate ON biometrics (inmate_id);

CREATE TABLE subscriptions (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE setup_pins (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uq_setup_pins_prison ON setup_pins (prison_id);

CREATE TABLE reports (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE servers (
  id            TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============ SINGLETON CONFIG (pricing, settings, storage) ============
CREATE TABLE singleton_config (
  id            TEXT PRIMARY KEY,          -- 'pricing' | 'settings' | 'storage'
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ SESSIONS / REFRESH TOKENS ============
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  role          TEXT NOT NULL,
  token_hash    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_sessions_user ON sessions (user_id);
CREATE INDEX ix_sessions_token_hash ON sessions (token_hash);
CREATE INDEX ix_sessions_expires ON sessions (expires_at);

-- ============ GENERIC HELPERS ============
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prisons_updated  BEFORE UPDATE ON prisons  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_wardens_updated  BEFORE UPDATE ON wardens  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inmates_updated  BEFORE UPDATE ON inmates  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_kiosks_updated   BEFORE UPDATE ON kiosks   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rooms_updated    BEFORE UPDATE ON rooms    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_calls_updated    BEFORE UPDATE ON calls    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recordings_updated BEFORE UPDATE ON recordings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_schedule_updated BEFORE UPDATE ON schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_wallets_updated  BEFORE UPDATE ON wallets  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_alerts_updated   BEFORE UPDATE ON alerts   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_incidents_updated BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_devices_updated  BEFORE UPDATE ON devices  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_kiosk_registration_requests_updated BEFORE UPDATE ON kiosk_registration_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_statistics_updated BEFORE UPDATE ON statistics FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_admins_updated   BEFORE UPDATE ON admins   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_super_admins_updated BEFORE UPDATE ON super_admins FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_biometrics_updated BEFORE UPDATE ON biometrics FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_setup_pins_updated BEFORE UPDATE ON setup_pins FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reports_updated  BEFORE UPDATE ON reports  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_servers_updated  BEFORE UPDATE ON servers  FOR EACH ROW EXECUTE FUNCTION set_updated_at();