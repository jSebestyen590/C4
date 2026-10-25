CREATE TABLE IF NOT EXISTS event_kategorien (
  id text PRIMARY KEY,
  name text NOT NULL,
  farbe text NOT NULL,
  archiviert boolean NOT NULL DEFAULT false
)
