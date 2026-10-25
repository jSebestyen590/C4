CREATE TABLE IF NOT EXISTS inventuren (
  id text PRIMARY KEY,
  lagerort_id text NOT NULL REFERENCES lagerorte (id),
  status text NOT NULL,
  gestartet_von text NOT NULL,
  gestartet_am timestamptz NOT NULL DEFAULT now(),
  vorgang_id text REFERENCES bestandsvorgaenge (id)
)
