CREATE TABLE IF NOT EXISTS inventar_kategorien (
  id text PRIMARY KEY,
  parent_id text REFERENCES inventar_kategorien (id),
  name text NOT NULL,
  archiviert boolean NOT NULL DEFAULT false
)
