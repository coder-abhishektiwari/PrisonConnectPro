-- Family wallet links + Razorpay payment attempts.
--
-- wallet_links: one active bearer token per family contact. Only the SHA-256
-- hash of the token is stored (a DB leak never exposes working links) and a
-- resend rotates it, revoking every previous link for that contact.
CREATE TABLE IF NOT EXISTS wallet_links (
  id            TEXT PRIMARY KEY,
  contact_id    TEXT,
  inmate_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_wallet_links_contact ON wallet_links (contact_id);
CREATE INDEX IF NOT EXISTS ix_wallet_links_inmate ON wallet_links (inmate_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_links_token ON wallet_links ((data->>'tokenHash'));
CREATE INDEX IF NOT EXISTS ix_wallet_links_active ON wallet_links (contact_id, (data->>'status'));

-- wallet_payments: one row per Razorpay order attempt. order_id is the
-- idempotency key that makes verify + webhook double-credit impossible.
CREATE TABLE IF NOT EXISTS wallet_payments (
  id            TEXT PRIMARY KEY,
  order_id      TEXT,
  contact_id    TEXT,
  inmate_id     TEXT,
  wallet_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_payments_order ON wallet_payments (order_id);
CREATE INDEX IF NOT EXISTS ix_wallet_payments_contact ON wallet_payments (contact_id);
CREATE INDEX IF NOT EXISTS ix_wallet_payments_status ON wallet_payments ((data->>'status'));
CREATE INDEX IF NOT EXISTS ix_wallet_payments_inmate ON wallet_payments (inmate_id);
