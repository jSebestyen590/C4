-- Finanzen: append-only journal. seq is gapless (counter row in fin_zaehler), hash chains the entries.
-- erstellt_von is a Cognito sub without FK (like bestandsvorgaenge).
CREATE TABLE IF NOT EXISTS fin_buchungen (
  id text PRIMARY KEY,
  seq bigint NOT NULL,
  datum date NOT NULL,
  text text NOT NULL,
  quelle_typ text NOT NULL,
  quelle_id text,
  event_id text REFERENCES events (id),
  storno_von text REFERENCES fin_buchungen (id),
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL,
  prev_hash text NOT NULL,
  hash text NOT NULL
)
