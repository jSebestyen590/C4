-- Funnels of the club (see docs/trichter.md). Volume in whole millilitres; archived ones stay in the ranking.
CREATE TABLE IF NOT EXISTS trichter (
  id text PRIMARY KEY,
  name text NOT NULL,
  volumen_ml integer NOT NULL CHECK (volumen_ml > 0),
  auslaesse integer NOT NULL CHECK (auslaesse >= 1),
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now()
)
