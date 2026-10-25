CREATE TABLE IF NOT EXISTS inventur_knoten (
  inventur_id text NOT NULL REFERENCES inventuren (id),
  lagerort_id text NOT NULL REFERENCES lagerorte (id),
  erledigt boolean NOT NULL DEFAULT false,
  PRIMARY KEY (inventur_id, lagerort_id)
)
