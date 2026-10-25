CREATE TABLE IF NOT EXISTS lagerort_waren (
  lagerort_id text NOT NULL REFERENCES lagerorte (id),
  ware_id text NOT NULL REFERENCES waren (id),
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (lagerort_id, ware_id)
)
