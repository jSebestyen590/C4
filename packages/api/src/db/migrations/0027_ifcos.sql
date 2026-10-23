-- lagerort_id null = the IFCO currently has no place. typ_id is plain text without a foreign key:
-- the reference to ifco_typen is enforced in the API (null = no type).
CREATE TABLE IF NOT EXISTS ifcos (
  id text PRIMARY KEY,
  name text NOT NULL,
  beschreibung text,
  lagerort_id text REFERENCES lagerorte (id),
  archiviert boolean NOT NULL DEFAULT false,
  typ_id text
)
