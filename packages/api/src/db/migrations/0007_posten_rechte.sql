CREATE TABLE IF NOT EXISTS posten_rechte (
  posten_id text NOT NULL REFERENCES posten (id),
  recht text NOT NULL,
  PRIMARY KEY (posten_id, recht)
)
