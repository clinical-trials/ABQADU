-- Projects (top-level container)
CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  start_date  DATE,
  status      VARCHAR(20) DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Calendars
CREATE TABLE IF NOT EXISTS calendars (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  work_days    INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  is_default   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_exceptions (
  id             SERIAL PRIMARY KEY,
  calendar_id    INTEGER REFERENCES calendars(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type VARCHAR(20) DEFAULT 'non_work',
  name           VARCHAR(100),
  UNIQUE(calendar_id, exception_date)
);

-- WBS hierarchy
CREATE TABLE IF NOT EXISTS wbs_nodes (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES wbs_nodes(id),
  name       VARCHAR(200) NOT NULL,
  wbs_code   VARCHAR(50),
  sort_order INTEGER DEFAULT 0
);

-- Activities
CREATE TABLE IF NOT EXISTS activities (
  id             SERIAL PRIMARY KEY,
  project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  wbs_id         INTEGER REFERENCES wbs_nodes(id),
  name           VARCHAR(300) NOT NULL,
  activity_type  VARCHAR(30) DEFAULT 'task_dependent',
  duration_days  INTEGER NOT NULL DEFAULT 1,
  planned_start  DATE,
  planned_finish DATE,
  actual_start   DATE,
  actual_finish  DATE,
  pct_complete   NUMERIC(5,2) DEFAULT 0,
  es             INTEGER,
  ef             INTEGER,
  ls             INTEGER,
  lf             INTEGER,
  total_float    INTEGER,
  free_float     INTEGER,
  is_critical    BOOLEAN DEFAULT FALSE,
  calendar_id    INTEGER REFERENCES calendars(id),
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Dependencies
CREATE TABLE IF NOT EXISTS dependencies (
  id             SERIAL PRIMARY KEY,
  predecessor_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  successor_id   INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  dep_type       VARCHAR(4) DEFAULT 'FS',
  lag_days       INTEGER DEFAULT 0,
  UNIQUE(predecessor_id, successor_id)
);
