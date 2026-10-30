CREATE TABLE IF NOT EXISTS schicht_bedarfe (
  schicht_id text NOT NULL REFERENCES schichten (id),
  dienstform_id text NOT NULL REFERENCES dienstformen (id),
  minimum integer NOT NULL,
  wunsch integer NOT NULL,
  PRIMARY KEY (schicht_id, dienstform_id),
  CHECK (minimum >= 0),
  CHECK (wunsch >= minimum)
)
