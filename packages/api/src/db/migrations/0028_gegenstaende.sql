CREATE TABLE IF NOT EXISTS gegenstaende (
  id text PRIMARY KEY,
  name text NOT NULL,
  beschreibung text,
  kategorie_id text NOT NULL REFERENCES inventar_kategorien (id),
  anzahl integer NOT NULL DEFAULT 1,
  archiviert boolean NOT NULL DEFAULT false
)
