-- Additive billing migration. Apply this file alone, after backup, in one
-- transaction. Never replay the legacy migration runner on an existing database.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS command_center_source_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS clients_command_center_source_key_unique
  ON clients(command_center_source_key);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS source_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS source_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS invoiceshelf_remote_status TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_source_key_unique ON invoices(source_key);

CREATE TABLE IF NOT EXISTS stripe_checkout_attempts (
  id UUID PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'usd'),
  livemode BOOLEAN NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_payload JSONB NOT NULL,
  stripe_session_id TEXT UNIQUE,
  checkout_url TEXT,
  state TEXT NOT NULL DEFAULT 'creating'
    CHECK (state IN ('creating','open','processing','paid','expired','failed')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_checkout_one_active_invoice
  ON stripe_checkout_attempts(invoice_id) WHERE state IN ('creating','open','processing');

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS manual_request_key UUID,
  ADD COLUMN IF NOT EXISTS manual_request_fingerprint TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payments_manual_request_unique ON payments(manual_request_key);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_unique
  ON payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_session_unique
  ON payments(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
