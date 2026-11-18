-- Finanzen: the Kassen of an event that was set explicitly (editable, deleted with the event).
CREATE TABLE IF NOT EXISTS fin_event_kassen (
  event_id text NOT NULL REFERENCES events (id),
  konto_id text NOT NULL REFERENCES fin_kassen (konto_id),
  PRIMARY KEY (event_id, konto_id)
)