-- erstellt_von is the Cognito sub without a foreign key: users without a profile row may lend too.
CREATE TABLE IF NOT EXISTS ausleihen (
  id text PRIMARY KEY,
  an text NOT NULL,
  ausgeliehen_am timestamptz NOT NULL,
  rueckgabe_geplant date,
  kommentar text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now()
)
