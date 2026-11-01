-- Who took part in a Durchgang. mitglied_sub has no foreign key: accounts without a profile row
-- (never logged in yet) may take part too.
CREATE TABLE IF NOT EXISTS trichter_teilnahmen (
  durchgang_id text NOT NULL REFERENCES trichter_durchgaenge (id),
  mitglied_sub text NOT NULL,
  PRIMARY KEY (durchgang_id, mitglied_sub)
)
