CREATE TABLE IF NOT EXISTS bestandsbuchungen (
  id text PRIMARY KEY,
  vorgang_id text NOT NULL REFERENCES bestandsvorgaenge (id),
  ware_id text NOT NULL REFERENCES waren (id),
  lagerort_id text NOT NULL REFERENCES lagerorte (id),
  gebinde_id text NOT NULL REFERENCES gebinde (id),
  mhd date,
  menge integer NOT NULL,
  art text NOT NULL
)
