-- Kind of the category: 'dienste' (events have Schichten and Dienste) or 'teilnahme' (events have participants).
-- Added nullable (DSQL cannot SET NOT NULL later); the API treats a missing value as 'dienste'. See docs/kalender.md.
ALTER TABLE event_kategorien ADD COLUMN IF NOT EXISTS art text
