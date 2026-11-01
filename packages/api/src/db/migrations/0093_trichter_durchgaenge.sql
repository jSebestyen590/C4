-- One funnel session; volumen_ml is the total, shared by the participants. eingetragen_von is the
-- Cognito sub of the member who recorded it, without a foreign key.
CREATE TABLE IF NOT EXISTS trichter_durchgaenge (
  id text PRIMARY KEY,
  trichter_id text NOT NULL REFERENCES trichter (id),
  volumen_ml integer NOT NULL CHECK (volumen_ml > 0),
  zeitpunkt timestamptz NOT NULL DEFAULT now(),
  eingetragen_von text NOT NULL,
  eingetragen_am timestamptz NOT NULL DEFAULT now()
)
