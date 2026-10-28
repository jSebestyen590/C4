-- Times are Berlin wall times (HH:MM); an end time at or before the begin means the next day.
-- tag_versatz (days from the event date, may be negative) is only used by Aufbau/Putzen; Betrieb stores 0.
CREATE TABLE IF NOT EXISTS vorlage_schichten (
  id text PRIMARY KEY,
  vorlage_id text NOT NULL REFERENCES event_vorlagen (id),
  art text NOT NULL,
  tag_versatz integer NOT NULL,
  beginn_zeit text NOT NULL,
  ende_zeit text NOT NULL,
  reihenfolge integer NOT NULL DEFAULT 0,
  minimum integer,
  wunsch integer,
  CHECK (art IN ('aufbau', 'betrieb', 'putzen'))
)
