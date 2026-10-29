-- True once a series event was edited by hand or cancelled; null/false = still as generated.
ALTER TABLE events ADD COLUMN IF NOT EXISTS serie_angepasst boolean
