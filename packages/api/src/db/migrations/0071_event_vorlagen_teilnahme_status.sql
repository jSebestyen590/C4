-- Participation circle a Vorlage hands to its events (same encoding as events.teilnahme_status).
ALTER TABLE event_vorlagen ADD COLUMN IF NOT EXISTS teilnahme_status text
