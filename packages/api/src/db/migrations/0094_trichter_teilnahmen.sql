-- Who took part in a Durchgang.
CREATE TABLE IF NOT EXISTS trichter_teilnahmen (
  durchgang_id text NOT NULL REFERENCES trichter_durchgaenge (id),
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  PRIMARY KEY (durchgang_id, mitglied_sub)
)
