-- Finanzen: draft of a Beleg (editable, deleted when booked or discarded). daten: form state as JSON text.
CREATE TABLE IF NOT EXISTS fin_beleg_entwuerfe (
  id text PRIMARY KEY,
  daten text NOT NULL,
  datei_sha256 text,
  datei_schluessel text,
  datei_typ text,
  datei_name text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL,
  geaendert_am timestamptz NOT NULL
)