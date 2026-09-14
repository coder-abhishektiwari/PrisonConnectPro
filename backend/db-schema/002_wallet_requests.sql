-- Wallet Requests table for warden dashboard wallet management
CREATE TABLE IF NOT EXISTS wallet_requests (
  id            TEXT PRIMARY KEY,
  inmate_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_wallet_requests_inmate ON wallet_requests (inmate_id);
CREATE INDEX IF NOT EXISTS ix_wallet_requests_status ON wallet_requests ((data->>'status'));
