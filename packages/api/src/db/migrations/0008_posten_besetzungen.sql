CREATE TABLE IF NOT EXISTS posten_besetzungen (
  id text PRIMARY KEY,
  posten_id text NOT NULL REFERENCES posten (id),
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  start_datum date NOT NULL,
  end_datum date
)
