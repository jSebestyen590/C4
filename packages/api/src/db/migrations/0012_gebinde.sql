CREATE TABLE IF NOT EXISTS gebinde (
  id text PRIMARY KEY,
  menge numeric(10,3),
  einheit text,
  verpackungseinheit text NOT NULL,
  pfand_cent integer,
  unter_gebinde_id text REFERENCES gebinde (id),
  unter_anzahl integer,
  archiviert boolean NOT NULL DEFAULT false,
  CHECK ((unter_gebinde_id IS NULL) = (unter_anzahl IS NULL)),
  CHECK ((unter_gebinde_id IS NULL) = (menge IS NOT NULL AND einheit IS NOT NULL))
)
