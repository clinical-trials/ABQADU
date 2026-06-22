-- Field tasks (daily crew assignments)
CREATE TABLE IF NOT EXISTS field_tasks (
  id           SERIAL PRIMARY KEY,
  activity_id  INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  resource_id  INTEGER REFERENCES resources(id),
  task_date    DATE NOT NULL,
  title        VARCHAR(300) NOT NULL,
  description  TEXT,
  status       VARCHAR(20) DEFAULT 'pending',
  notes        TEXT,
  sms_sent_at  TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Risk register
CREATE TABLE IF NOT EXISTS risks (
  id               SERIAL PRIMARY KEY,
  project_id       INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title            VARCHAR(300) NOT NULL,
  description      TEXT,
  category         VARCHAR(50),
  probability      INTEGER CHECK (probability BETWEEN 1 AND 5),
  impact           INTEGER CHECK (impact BETWEEN 1 AND 5),
  risk_score       INTEGER,
  status           VARCHAR(20) DEFAULT 'open',
  owner_id         INTEGER REFERENCES resources(id),
  mitigation_plan  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id            SERIAL PRIMARY KEY,
  project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  activity_id   INTEGER REFERENCES activities(id),
  risk_id       INTEGER REFERENCES risks(id),
  field_task_id INTEGER REFERENCES field_tasks(id),
  author_name   VARCHAR(100) NOT NULL,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  resource_id  INTEGER REFERENCES resources(id),
  type         VARCHAR(50) NOT NULL,
  title        VARCHAR(200),
  body         TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
