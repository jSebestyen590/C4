CREATE TABLE IF NOT EXISTS gebinde (
  id text PRIMARY KEY,
  name text NOT NULL,
  pfand_cent integer NOT NULL DEFAULT 0,
  unter_gebinde_id text REFERENCES gebinde (id),
  unter_anzahl integer,
  archiviert boolean NOT NULL DEFAULT false,
  CHECK ((unter_gebinde_id IS NULL) = (unter_anzahl IS NULL))
)
