-- Finanzen: Grundbestand of a Kasse per denomination (replaced when saved).
CREATE TABLE IF NOT EXISTS fin_kassen_grundbestand (
  konto_id text NOT NULL REFERENCES fin_kassen (konto_id),
  nennwert_cent integer NOT NULL CHECK (nennwert_cent IN (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000)),
  anzahl integer NOT NULL CHECK (anzahl >= 0),
  PRIMARY KEY (konto_id, nennwert_cent)
)