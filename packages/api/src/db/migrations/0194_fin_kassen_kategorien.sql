-- Finanzen: standard Kassen per event Kategorie (editable master data, a Kasse can be standard for several Kategorien).
CREATE TABLE IF NOT EXISTS fin_kassen_kategorien (
  kategorie_id text NOT NULL REFERENCES event_kategorien (id),
  konto_id text NOT NULL REFERENCES fin_kassen (konto_id),
  PRIMARY KEY (kategorie_id, konto_id)
)