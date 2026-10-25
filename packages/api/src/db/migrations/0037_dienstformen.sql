CREATE TABLE IF NOT EXISTS dienstformen (
  id text PRIMARY KEY,
  name text NOT NULL,
  reihenfolge integer NOT NULL DEFAULT 0,
  archiviert boolean NOT NULL DEFAULT false
)
