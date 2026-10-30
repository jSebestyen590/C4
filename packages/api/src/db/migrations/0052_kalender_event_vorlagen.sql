-- titel is null (or empty) when no title was entered. teilnahme_status: participation circle the Vorlage hands
-- to its events (same encoding as events.teilnahme_status).
CREATE TABLE IF NOT EXISTS event_vorlagen (
  id text PRIMARY KEY,
  titel text,
  beschreibung text,
  kategorie_id text NOT NULL REFERENCES event_kategorien (id),
  beginn_zeit text NOT NULL,
  ende_zeit text NOT NULL,
  teilnahme_status text,
  archiviert boolean NOT NULL DEFAULT false
)
