-- A request for a private party. person_id, umfrage_id and event_id are no foreign keys, checked in the API.
-- person_id is null for blank entries (e.g. created from a mail). angelegt_von is a Cognito sub.
CREATE TABLE IF NOT EXISTS privatpartys (
  id text PRIMARY KEY,
  person_id text,
  anlass text,
  notizen text,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'zugesagt', 'abgesagt')),
  termin_id text,
  umfrage_id text,
  event_id text,
  mail_adresse text,
  letzte_nachricht_am timestamptz,
  angelegt_von text,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
)
