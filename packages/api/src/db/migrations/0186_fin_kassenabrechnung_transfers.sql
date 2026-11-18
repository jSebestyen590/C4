-- Finanzen: transfers of a Kassenabrechnung (insert-only). Ziel-Fach: positive = Kasse to Ziel-Fach, negative = Ziel-Fach to Kasse, Nachschub-Fach: negative = Fach to Ziel-Fach.
CREATE TABLE IF NOT EXISTS fin_kassenabrechnung_transfers (
  abrechnung_id text NOT NULL REFERENCES fin_kassenabrechnungen (id),
  fach_id text NOT NULL REFERENCES fin_konten (id),
  nennwert_cent integer NOT NULL CHECK (nennwert_cent IN (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000)),
  anzahl integer NOT NULL,
  PRIMARY KEY (abrechnung_id, fach_id, nennwert_cent)
)