-- lagerort_id null = the Ifco currently has no place.
CREATE TABLE IF NOT EXISTS ifcos (
  id text PRIMARY KEY,
  name text NOT NULL,
  beschreibung text,
  lagerort_id text REFERENCES lagerorte (id),
  archiviert boolean NOT NULL DEFAULT false
)
