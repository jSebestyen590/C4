-- Finanzen: items of a booked Beleg (insert-only). anzahl_milli: thousandths (1,5 kg = 1500); steuersatz in basis points.
CREATE TABLE IF NOT EXISTS fin_belegposten (
  beleg_id text NOT NULL REFERENCES fin_belege (id),
  pos integer NOT NULL,
  kategorie_id text NOT NULL REFERENCES fin_konten (id),
  text text NOT NULL,
  anzahl_milli integer NOT NULL,
  einzelpreis_cent bigint NOT NULL,
  steuersatz integer NOT NULL,
  betrag_cent bigint NOT NULL,
  PRIMARY KEY (beleg_id, pos)
)