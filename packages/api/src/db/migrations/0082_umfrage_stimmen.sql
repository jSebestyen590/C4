-- Single answers: an option (option_id) or a free text (option_id null).
CREATE TABLE IF NOT EXISTS umfrage_stimmen (
  id text PRIMARY KEY,
  umfrage_id text NOT NULL REFERENCES umfragen (id),
  frage_id text NOT NULL REFERENCES umfrage_fragen (id),
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  option_id text REFERENCES umfrage_optionen (id),
  freitext text,
  CHECK ((option_id IS NULL) <> (freitext IS NULL))
)
