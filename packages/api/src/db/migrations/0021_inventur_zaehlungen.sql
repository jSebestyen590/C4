CREATE TABLE IF NOT EXISTS inventur_zaehlungen (
  id text PRIMARY KEY,
  inventur_id text NOT NULL REFERENCES inventuren (id),
  lagerort_id text NOT NULL REFERENCES lagerorte (id),
  ware_id text NOT NULL REFERENCES waren (id),
  gebinde_id text NOT NULL REFERENCES gebinde (id),
  mhd date,
  anzahl integer NOT NULL
)
