-- General key/value settings; first key: lager_abgleich_stichtag (ISO date).
CREATE TABLE IF NOT EXISTS einstellungen (
  schluessel text PRIMARY KEY,
  wert text NOT NULL,
  geaendert_von text NOT NULL,
  geaendert_am timestamptz NOT NULL
)
