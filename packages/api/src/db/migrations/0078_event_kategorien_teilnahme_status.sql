-- Default participation circle of a 'teilnahme' category, same coding as events.teilnahme_status
-- (comma-separated member statuses, empty string = nobody by status). Null for Dienste categories.
ALTER TABLE event_kategorien ADD COLUMN IF NOT EXISTS teilnahme_status text
