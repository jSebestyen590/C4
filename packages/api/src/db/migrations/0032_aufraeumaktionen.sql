-- A clean-up after an event; open while beendet_am is null. The *_von columns are Cognito subs
-- without a foreign key, like ausleihen.erstellt_von.
CREATE TABLE IF NOT EXISTS aufraeumaktionen (
  id text PRIMARY KEY,
  gestartet_am timestamptz NOT NULL DEFAULT now(),
  gestartet_von text NOT NULL,
  beendet_am timestamptz,
  beendet_von text
)
