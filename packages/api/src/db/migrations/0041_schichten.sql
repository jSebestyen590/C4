CREATE TABLE IF NOT EXISTS schichten (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events (id),
  art text NOT NULL,
  beginn timestamptz NOT NULL,
  ende timestamptz NOT NULL,
  reihenfolge integer NOT NULL DEFAULT 0,
  CHECK (art IN ('aufbau', 'betrieb', 'putzen')),
  CHECK (ende > beginn)
)
