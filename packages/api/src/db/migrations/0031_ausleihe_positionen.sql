-- The origin is stored as a place (not as a gegenstand_plaetze id) so re-arranging keeps the history.
-- ganze_ifco: true for the positions of an Ausleihe that lends a whole IFCO; null/false = single item.
CREATE TABLE IF NOT EXISTS ausleihe_positionen (
  id text PRIMARY KEY,
  ausleihe_id text NOT NULL REFERENCES ausleihen (id),
  gegenstand_id text NOT NULL REFERENCES gegenstaende (id),
  lagerort_id text REFERENCES lagerorte (id),
  ifco_id text REFERENCES ifcos (id),
  anzahl integer NOT NULL,
  zurueck_am timestamptz,
  ganze_ifco boolean,
  CHECK ((lagerort_id IS NULL) <> (ifco_id IS NULL)),
  CHECK (anzahl >= 1)
)
