-- Phase 1: Bidding & Invoicing

-- Clients / leads
CREATE TABLE IF NOT EXISTS clients (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  email        VARCHAR(200),
  phone        VARCHAR(40),
  address      TEXT,
  lead_source  VARCHAR(80),
  status       VARCHAR(20) DEFAULT 'lead',   -- lead | active | won | lost
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Bids / estimates
CREATE TABLE IF NOT EXISTS bids (
  id            SERIAL PRIMARY KEY,
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  design_id     INTEGER REFERENCES designs(id) ON DELETE SET NULL,
  bid_number    VARCHAR(40) UNIQUE,
  title         VARCHAR(200) NOT NULL DEFAULT 'ADU Estimate',
  status        VARCHAR(20) DEFAULT 'draft',  -- draft | sent | accepted | declined
  markup_pct    NUMERIC(5,2) DEFAULT 18.0,
  tax_pct       NUMERIC(5,3) DEFAULT 7.625,   -- ABQ gross receipts tax
  contingency_pct NUMERIC(5,2) DEFAULT 5.0,
  notes         TEXT,
  valid_until   DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Bid line items
CREATE TABLE IF NOT EXISTS bid_line_items (
  id          SERIAL PRIMARY KEY,
  bid_id      INTEGER REFERENCES bids(id) ON DELETE CASCADE,
  category    VARCHAR(80),
  description VARCHAR(300) NOT NULL,
  qty         NUMERIC(12,2) DEFAULT 1,
  unit        VARCHAR(20) DEFAULT 'ea',
  unit_cost   NUMERIC(12,2) DEFAULT 0,
  sort_order  INTEGER DEFAULT 0
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id             SERIAL PRIMARY KEY,
  bid_id         INTEGER REFERENCES bids(id) ON DELETE SET NULL,
  client_id      INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id     INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  invoice_number VARCHAR(40) UNIQUE,
  draw_type      VARCHAR(40) DEFAULT 'progress',  -- deposit | progress | final
  description    VARCHAR(300),
  amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20) DEFAULT 'draft',     -- draft | sent | paid | overdue
  issued_date    DATE,
  due_date       DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Payments against invoices
CREATE TABLE IF NOT EXISTS payments (
  id           SERIAL PRIMARY KEY,
  invoice_id   INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL,
  method       VARCHAR(40),    -- check | card | ach | cash
  reference    VARCHAR(80),
  paid_date    DATE DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bid_line_items_bid ON bid_line_items(bid_id);
CREATE INDEX IF NOT EXISTS idx_invoices_bid ON invoices(bid_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
