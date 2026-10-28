-- Who takes part in the event by default: null = no participation, otherwise comma-separated member statuses
-- (empty string = nobody by status, only invited/self-signed people). See docs/kalender.md.
ALTER TABLE events ADD COLUMN IF NOT EXISTS teilnahme_status text
