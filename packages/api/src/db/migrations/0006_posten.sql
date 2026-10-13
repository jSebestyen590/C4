CREATE TABLE IF NOT EXISTS posten (
  id text PRIMARY KEY,
  name text NOT NULL,
  beschreibung text,
  archiviert boolean NOT NULL DEFAULT false,
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
)
