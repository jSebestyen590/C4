-- Finanzen: per denomination stock, count, Grundbestand and stock after of a Kassenabrechnung (insert-only).
CREATE TABLE IF NOT EXISTS fin_kassenabrechnung_posten (
  abrechnung_id text NOT NULL REFERENCES fin_kassenabrechnungen (id),
  nennwert_cent integer NOT NULL CHECK (nennwert_cent IN (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000)),
  soll integer NOT NULL,
  ist integer NOT NULL,
  grundbestand integer NOT NULL,
  danach integer NOT NULL,
  PRIMARY KEY (abrechnung_id, nennwert_cent)
)