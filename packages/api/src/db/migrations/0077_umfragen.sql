-- Polls (see docs/umfragen.md). A poll runs until the end of endet_am (Europe/Berlin) unless
-- beendet_am is set. Circles by status are comma-separated like events.teilnahme_status,
-- reminders are comma-separated days before the end.
CREATE TABLE IF NOT EXISTS umfragen (
  id text PRIMARY KEY,
  titel text NOT NULL,
  beschreibung text,
  ersteller_sub text NOT NULL REFERENCES mitglieder (sub),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  endet_am date NOT NULL,
  beendet_am timestamptz,
  anonym boolean NOT NULL,
  ergebnisse text NOT NULL CHECK (ergebnisse IN ('sofort', 'nach_abstimmung', 'nach_ende')),
  pflicht_status text NOT NULL DEFAULT '',
  optional_status text NOT NULL DEFAULT '',
  erinnerungen_pflicht text NOT NULL DEFAULT '',
  erinnerungen_optional text NOT NULL DEFAULT ''
)
