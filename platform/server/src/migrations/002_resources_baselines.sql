-- Baselines
CREATE TABLE IF NOT EXISTS baselines (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS baseline_activities (
  id             SERIAL PRIMARY KEY,
  baseline_id    INTEGER REFERENCES baselines(id) ON DELETE CASCADE,
  activity_id    INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  planned_start  DATE,
  planned_finish DATE,
  duration_days  INTEGER,
  total_float    INTEGER,
  budgeted_cost  NUMERIC(12,2)
);

-- Resources (global + project-scoped)
CREATE TABLE IF NOT EXISTS resources (
  id                SERIAL PRIMARY KEY,
  project_id        INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name              VARCHAR(200) NOT NULL,
  trade             VARCHAR(100),
  resource_type     VARCHAR(20) DEFAULT 'labor',
  max_units_per_day NUMERIC(5,2) DEFAULT 1,
  cost_per_unit     NUMERIC(10,2),
  calendar_id       INTEGER REFERENCES calendars(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Resource assignments
CREATE TABLE IF NOT EXISTS assignments (
  id             SERIAL PRIMARY KEY,
  activity_id    INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  resource_id    INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  units          NUMERIC(5,2) DEFAULT 1,
  budgeted_cost  NUMERIC(10,2),
  actual_cost    NUMERIC(10,2) DEFAULT 0,
  UNIQUE(activity_id, resource_id)
);
