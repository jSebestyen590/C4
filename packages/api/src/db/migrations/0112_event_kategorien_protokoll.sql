-- Category of a meeting that gets minutes ("Sitzung mit Protokoll"); only meaningful for art = 'teilnahme'.
ALTER TABLE event_kategorien ADD COLUMN IF NOT EXISTS protokoll boolean
