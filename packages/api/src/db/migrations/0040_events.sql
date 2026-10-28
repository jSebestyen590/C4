-- angelegt_von is a Cognito sub without a foreign key: users without a profile row may manage events;
-- it is null for events created by the system (series). serie names the series (e.g. 'barabend') while the
-- event is still an unchanged part of it.
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  titel text NOT NULL,
  beschreibung text,
  kategorie_id text REFERENCES event_kategorien (id),
  beginn timestamptz NOT NULL,
  ende timestamptz NOT NULL,
  abgesagt boolean NOT NULL DEFAULT false,
  serie text,
  angelegt_von text,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  CHECK (ende > beginn)
)
