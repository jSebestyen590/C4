-- Finanzen: rounding corrections per tax rate of a net Beleg (insert-only).
CREATE TABLE IF NOT EXISTS fin_beleg_korrekturen (
  beleg_id text NOT NULL REFERENCES fin_belege (id),
  steuersatz integer NOT NULL,
  netto_cent bigint NOT NULL,
  steuer_cent bigint NOT NULL,
  PRIMARY KEY (beleg_id, steuersatz)
)