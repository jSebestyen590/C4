CREATE TABLE IF NOT EXISTS ware_aliase (
  ware_id text NOT NULL REFERENCES waren (id),
  alias text NOT NULL,
  PRIMARY KEY (ware_id, alias)
)
