-- Fixed answers of a question.
CREATE TABLE IF NOT EXISTS umfrage_optionen (
  id text PRIMARY KEY,
  frage_id text NOT NULL REFERENCES umfrage_fragen (id),
  position integer NOT NULL,
  text text NOT NULL
)
