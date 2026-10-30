CREATE TABLE IF NOT EXISTS vorlage_bedarfe (
  vorlage_schicht_id text NOT NULL REFERENCES vorlage_schichten (id),
  dienstform_id text NOT NULL REFERENCES dienstformen (id),
  minimum integer NOT NULL,
  wunsch integer NOT NULL,
  PRIMARY KEY (vorlage_schicht_id, dienstform_id),
  CHECK (minimum >= 0),
  CHECK (wunsch >= minimum)
)
