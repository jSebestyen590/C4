-- Per-member setting of a notification type (key from BENACHRICHTIGUNGS_ARTEN); a missing row means the default.
CREATE TABLE IF NOT EXISTS benachrichtigung_einstellungen (
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  art text NOT NULL,
  aktiv boolean NOT NULL,
  minuten integer,
  PRIMARY KEY (mitglied_sub, art)
)
