-- titel is null (or empty) when no title was entered: the Kategorie's name is shown instead.
-- angelegt_von is a Cognito sub without a foreign key: users without a profile row may manage events;
-- it is null for events created by the system (series). serie names the series (e.g. 'barabend') while the
-- event is still an unchanged part of it; serie_angepasst is true once such an event was edited by hand or
-- cancelled (null/false = still as generated). teilnahme_status: who takes part by default (null = no
-- participation, otherwise comma-separated member statuses, empty string = nobody by status).
-- verantwortlich_sub: optional responsible member.
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  titel text,
  beschreibung text,
  kategorie_id text NOT NULL REFERENCES event_kategorien (id),
  beginn timestamptz NOT NULL,
  ende timestamptz NOT NULL,
  abgesagt boolean NOT NULL DEFAULT false,
  serie text,
  serie_angepasst boolean,
  teilnahme_status text,
  verantwortlich_sub text REFERENCES mitglieder (sub),
  angelegt_von text,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  CHECK (ende > beginn)
)
