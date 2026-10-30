-- One Web Push subscription per device and member (see docs/benachrichtigungen.md).
CREATE TABLE IF NOT EXISTS push_abos (
  id text PRIMARY KEY,
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  erstellt timestamptz NOT NULL DEFAULT now()
)
