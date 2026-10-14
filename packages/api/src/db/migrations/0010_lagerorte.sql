CREATE TABLE IF NOT EXISTS lagerorte (
  id text PRIMARY KEY,
  parent_id text REFERENCES lagerorte (id),
  name text NOT NULL,
  beschreibung text,
  position integer NOT NULL DEFAULT 0,
  archiviert boolean NOT NULL DEFAULT false
)
