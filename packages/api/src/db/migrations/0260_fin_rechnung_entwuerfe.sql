-- Finanzen: draft of a Rechnung (editable, deleted when issued or discarded). daten: form state as JSON text.
CREATE TABLE IF NOT EXISTS fin_rechnung_entwuerfe (
  id text PRIMARY KEY,
  daten text NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL,
  geaendert_am timestamptz NOT NULL
)