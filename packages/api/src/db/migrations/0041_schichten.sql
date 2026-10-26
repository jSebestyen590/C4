-- minimum/wunsch are the head count of Aufbau/Putzen Schichten (no Dienstform); null for Betrieb,
-- whose Bedarf lives in schicht_bedarfe.
CREATE TABLE IF NOT EXISTS schichten (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events (id),
  art text NOT NULL,
  beginn timestamptz NOT NULL,
  ende timestamptz NOT NULL,
  reihenfolge integer NOT NULL DEFAULT 0,
  minimum integer,
  wunsch integer,
  CHECK (art IN ('aufbau', 'betrieb', 'putzen')),
  CHECK (ende > beginn)
)
