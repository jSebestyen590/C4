CREATE TABLE IF NOT EXISTS posten (
  id text PRIMARY KEY,
  name text NOT NULL,
  beschreibung text,
  bezeichnung_maennlich text,
  bezeichnung_weiblich text,
  bezeichnung_neutral text,
  archiviert boolean NOT NULL DEFAULT false,
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
)
