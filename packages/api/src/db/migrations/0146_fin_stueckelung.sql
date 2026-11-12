-- Finanzen: denomination breakdown of a line on a Stückelung account (anzahl signed).
CREATE TABLE IF NOT EXISTS fin_stueckelung (
  zeile_id text NOT NULL REFERENCES fin_buchungszeilen (id),
  nennwert_cent integer NOT NULL CHECK (nennwert_cent IN (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000)),
  anzahl integer NOT NULL,
  PRIMARY KEY (zeile_id, nennwert_cent)
)
