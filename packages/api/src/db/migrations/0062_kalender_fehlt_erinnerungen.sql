-- Global "Dienste fehlen" reminders: minutes before the event begin. The id is derived from the minutes.
CREATE TABLE IF NOT EXISTS kalender_fehlt_erinnerungen (
  id text PRIMARY KEY,
  minuten_vorher integer NOT NULL,
  CHECK (minuten_vorher > 0)
)
