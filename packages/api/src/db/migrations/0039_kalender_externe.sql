-- Externe helpers who are entered into Dienste; quelle is free text (e.g. a friend of X, or StuK).
CREATE TABLE IF NOT EXISTS externe (
  id text PRIMARY KEY,
  name text NOT NULL,
  kontakt text,
  quelle text,
  angelegt_von text NOT NULL REFERENCES mitglieder (sub),
  archiviert boolean NOT NULL DEFAULT false
)
