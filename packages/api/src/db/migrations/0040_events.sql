-- angelegt_von is a Cognito sub without a foreign key: users without a profile row may manage events.
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  titel text NOT NULL,
  beschreibung text,
  kategorie_id text REFERENCES event_kategorien (id),
  beginn timestamptz NOT NULL,
  ende timestamptz NOT NULL,
  abgesagt boolean NOT NULL DEFAULT false,
  angelegt_von text NOT NULL,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  CHECK (ende > beginn)
)
