-- art: 'dienste' (events have Schichten and Dienste) or 'teilnahme' (events have participants).
-- teilnahme_status: default participation circle of a 'teilnahme' category, same coding as events.teilnahme_status
-- (comma-separated member statuses, empty string = nobody by status); null for Dienste categories.
CREATE TABLE IF NOT EXISTS event_kategorien (
  id text PRIMARY KEY,
  name text NOT NULL,
  farbe text NOT NULL,
  art text NOT NULL,
  teilnahme_status text,
  archiviert boolean NOT NULL DEFAULT false,
  CHECK (art IN ('dienste', 'teilnahme'))
)
