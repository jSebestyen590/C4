-- Individual participation records: invited by a manager (eingeladen) and/or the member's own answer
-- (null = none, 'teilnahme', 'absage'). Whether somebody takes part is computed, see teilnehmend() in shared.
CREATE TABLE IF NOT EXISTS event_teilnahmen (
  event_id text NOT NULL REFERENCES events (id),
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  antwort text,
  eingeladen boolean NOT NULL DEFAULT false,
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, mitglied_sub),
  CHECK (antwort IS NULL OR antwort IN ('teilnahme', 'absage'))
)
