-- Finanzen: marks an event whose Kassen were set explicitly (until then the standard of its Kategorie applies). Editable, deleted with the event.
CREATE TABLE IF NOT EXISTS fin_event_kassen_angepasst (
  event_id text PRIMARY KEY REFERENCES events (id)
)