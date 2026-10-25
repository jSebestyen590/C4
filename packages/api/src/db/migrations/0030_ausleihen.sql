-- erstellt_von and organisiert_von are Cognito subs without a foreign key: users without a profile
-- row may lend too; the API checks that the organiser is a Mitglied (null on old rows = erstellt_von).
CREATE TABLE IF NOT EXISTS ausleihen (
  id text PRIMARY KEY,
  an text NOT NULL,
  ausgeliehen_am timestamptz NOT NULL,
  rueckgabe_geplant date,
  kommentar text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  organisiert_von text
)
