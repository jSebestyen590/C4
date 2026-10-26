-- Times are Berlin wall times (HH:MM); the day offsets count days from the event date.
CREATE TABLE IF NOT EXISTS vorlage_schichten (
  id text PRIMARY KEY,
  vorlage_id text NOT NULL REFERENCES event_vorlagen (id),
  art text NOT NULL,
  tag_versatz integer NOT NULL,
  beginn_zeit text NOT NULL,
  ende_tag_versatz integer NOT NULL,
  ende_zeit text NOT NULL,
  reihenfolge integer NOT NULL DEFAULT 0,
  minimum integer,
  wunsch integer,
  CHECK (art IN ('aufbau', 'betrieb', 'putzen'))
)
