-- Finanzen: counted pieces per denomination of a Dienst-Zählung (insert-only).
CREATE TABLE IF NOT EXISTS fin_kassenzaehlung_posten (
  zaehlung_id text NOT NULL REFERENCES fin_kassenzaehlungen (id),
  nennwert_cent integer NOT NULL CHECK (nennwert_cent IN (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000)),
  anzahl integer NOT NULL,
  PRIMARY KEY (zaehlung_id, nennwert_cent)
)