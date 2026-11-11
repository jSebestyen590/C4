-- Notification history per member (90 days, see docs/benachrichtigungen.md).
CREATE TABLE IF NOT EXISTS benachrichtigung_verlauf (
  id text PRIMARY KEY,
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  art text NOT NULL,
  titel text NOT NULL,
  text text NOT NULL,
  url text NOT NULL,
  schluessel text,
  erstellt timestamptz NOT NULL DEFAULT now(),
  gelesen timestamptz
)
