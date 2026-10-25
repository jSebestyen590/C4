CREATE TABLE IF NOT EXISTS ware_gebinde (
  ware_id text NOT NULL REFERENCES waren (id),
  gebinde_id text NOT NULL REFERENCES gebinde (id),
  PRIMARY KEY (ware_id, gebinde_id)
)
