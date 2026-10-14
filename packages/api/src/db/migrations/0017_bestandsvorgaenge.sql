-- erstellt_von is the Cognito sub without a foreign key: users without a profile row may book too.
CREATE TABLE IF NOT EXISTS bestandsvorgaenge (
  id text PRIMARY KEY,
  typ text NOT NULL,
  quelle text NOT NULL,
  zeitpunkt timestamptz NOT NULL,
  kommentar text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now()
)
