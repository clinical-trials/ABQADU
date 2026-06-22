-- Design templates and saved floor plans

CREATE TABLE IF NOT EXISTS design_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  sqft        INTEGER,
  bedrooms    INTEGER DEFAULT 1,
  bathrooms   INTEGER DEFAULT 1,
  thumbnail   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS designs (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES design_templates(id),
  name        TEXT NOT NULL DEFAULT 'Floor Plan',
  rooms       JSONB NOT NULL DEFAULT '[]',
  total_sqft  NUMERIC(8,1),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the 5 ABQ ADU models as templates
INSERT INTO design_templates (name, slug, description, sqft, bedrooms, bathrooms) VALUES
  ('Hyder Hut',       'hyder-hut',     'Compact 1BR studio, ideal for backyard ADU', 440, 1, 1),
  ('Hyder Hut 2BR',   'hyder-hut-2br', 'Two-bedroom expansion of the Hyder Hut',    550, 2, 1),
  ('Altura 24×24',    'altura-24x24',  'Open-plan single-story, 24×24 footprint',   576, 1, 1),
  ('Casita Portal',   'casita-portal', 'Southwest-style with covered portal porch',  640, 2, 1),
  ('Tierra Grande',   'tierra-grande', 'Largest model — 2BR/2BA with flex room',    780, 2, 2)
ON CONFLICT (slug) DO NOTHING;

-- Seed room layouts for each template
INSERT INTO designs (template_id, name, rooms, total_sqft)
SELECT id, name || ' — Default Layout',
  CASE slug
    WHEN 'hyder-hut' THEN '[
      {"id":"r1","type":"living","label":"Living/Kitchen","color":"#E8C8C8","x":12,"y":12,"w":216,"h":168},
      {"id":"r2","type":"bedroom","label":"Bedroom","color":"#C8D8E8","x":12,"y":192,"w":156,"h":120},
      {"id":"r3","type":"bathroom","label":"Bath","color":"#D8E8C8","x":180,"y":192,"w":72,"h":96},
      {"id":"r4","type":"utility","label":"Utility","color":"#C8E8E8","x":180,"y":300,"w":72,"h":60}
    ]'::jsonb
    WHEN 'hyder-hut-2br' THEN '[
      {"id":"r1","type":"living","label":"Living/Kitchen","color":"#E8C8C8","x":12,"y":12,"w":252,"h":156},
      {"id":"r2","type":"bedroom","label":"Bedroom 1","color":"#C8D8E8","x":12,"y":180,"w":132,"h":120},
      {"id":"r3","type":"bedroom","label":"Bedroom 2","color":"#C8D8E8","x":12,"y":312,"w":132,"h":108},
      {"id":"r4","type":"bathroom","label":"Bath","color":"#D8E8C8","x":156,"y":180,"w":96,"h":96},
      {"id":"r5","type":"utility","label":"Utility","color":"#C8E8E8","x":156,"y":288,"w":96,"h":60}
    ]'::jsonb
    WHEN 'altura-24x24' THEN '[
      {"id":"r1","type":"living","label":"Living","color":"#E8C8C8","x":12,"y":12,"w":168,"h":144},
      {"id":"r2","type":"kitchen","label":"Kitchen","color":"#E8DCC8","x":192,"y":12,"w":120,"h":144},
      {"id":"r3","type":"bedroom","label":"Bedroom","color":"#C8D8E8","x":12,"y":168,"w":168,"h":132},
      {"id":"r4","type":"bathroom","label":"Bath","color":"#D8E8C8","x":192,"y":168,"w":96,"h":96},
      {"id":"r5","type":"closet","label":"Closet","color":"#E8E8C8","x":192,"y":276,"w":96,"h":60}
    ]'::jsonb
    WHEN 'casita-portal' THEN '[
      {"id":"r1","type":"living","label":"Living","color":"#E8C8C8","x":12,"y":12,"w":192,"h":144},
      {"id":"r2","type":"kitchen","label":"Kitchen","color":"#E8DCC8","x":12,"y":168,"w":144,"h":120},
      {"id":"r3","type":"dining","label":"Dining","color":"#D8C8E8","x":168,"y":168,"w":120,"h":120},
      {"id":"r4","type":"bedroom","label":"Bedroom 1","color":"#C8D8E8","x":12,"y":300,"w":144,"h":132},
      {"id":"r5","type":"bedroom","label":"Bedroom 2","color":"#C8D8E8","x":168,"y":300,"w":120,"h":132},
      {"id":"r6","type":"bathroom","label":"Bath","color":"#D8E8C8","x":216,"y":12,"w":96,"h":96},
      {"id":"r7","type":"porch","label":"Portal Porch","color":"#D0E0D0","x":12,"y":444,"w":252,"h":72}
    ]'::jsonb
    WHEN 'tierra-grande' THEN '[
      {"id":"r1","type":"living","label":"Living","color":"#E8C8C8","x":12,"y":12,"w":216,"h":156},
      {"id":"r2","type":"kitchen","label":"Kitchen","color":"#E8DCC8","x":12,"y":180,"w":144,"h":132},
      {"id":"r3","type":"dining","label":"Dining","color":"#D8C8E8","x":168,"y":180,"w":120,"h":132},
      {"id":"r4","type":"bedroom","label":"Primary BR","color":"#C8D8E8","x":12,"y":324,"w":168,"h":144},
      {"id":"r5","type":"bathroom","label":"Primary Bath","color":"#D8E8C8","x":192,"y":324,"w":96,"h":96},
      {"id":"r6","type":"bedroom","label":"Bedroom 2","color":"#C8D8E8","x":12,"y":480,"w":144,"h":120},
      {"id":"r7","type":"bathroom","label":"Bath 2","color":"#D8E8C8","x":168,"y":480,"w":96,"h":84},
      {"id":"r8","type":"utility","label":"Flex Room","color":"#C8E8E8","x":276,"y":12,"w":96,"h":96},
      {"id":"r9","type":"porch","label":"Portal","color":"#D0E0D0","x":12,"y":612,"w":264,"h":72}
    ]'::jsonb
  END,
  sqft
FROM design_templates;
