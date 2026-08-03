-- InvoiceShelf back-office engine sync

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS invoiceshelf_customer_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoiceshelf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiceshelf_sync_error TEXT;

ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS invoiceshelf_estimate_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoiceshelf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiceshelf_sync_error TEXT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoiceshelf_invoice_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoiceshelf_public_url TEXT,
  ADD COLUMN IF NOT EXISTS invoiceshelf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiceshelf_sync_error TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS invoiceshelf_payment_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoiceshelf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiceshelf_sync_error TEXT;

CREATE TABLE IF NOT EXISTS invoice_engine_events (
  id SERIAL PRIMARY KEY,
  local_type VARCHAR(40) NOT NULL,
  local_id INTEGER,
  remote_type VARCHAR(40),
  remote_id VARCHAR(80),
  event_type VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_engine_events_local
  ON invoice_engine_events(local_type, local_id, created_at DESC);
