-- Finanzen: stock (soll) and count (ist) per denomination of a Zählung (insert-only).
CREATE TABLE IF NOT EXISTS fin_zaehlung_posten (
  zaehlung_id text NOT NULL REFERENCES fin_zaehlungen (id),
  nennwert_cent integer NOT NULL CHECK (nennwert_cent IN (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000)),
  soll_anzahl integer NOT NULL,
  ist_anzahl integer NOT NULL,
  PRIMARY KEY (zaehlung_id, nennwert_cent)
)