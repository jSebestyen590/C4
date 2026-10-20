-- Exactly one of lagerort_id (loose at a place) and ifco_id (inside an Ifco) is set.
CREATE TABLE IF NOT EXISTS gegenstand_plaetze (
  id text PRIMARY KEY,
  gegenstand_id text NOT NULL REFERENCES gegenstaende (id),
  lagerort_id text REFERENCES lagerorte (id),
  ifco_id text REFERENCES ifcos (id),
  anzahl integer NOT NULL,
  CHECK ((lagerort_id IS NULL) <> (ifco_id IS NULL)),
  CHECK (anzahl >= 1)
)
