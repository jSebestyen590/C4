-- Questions of a poll; max_antworten null = all answers may be picked.
CREATE TABLE IF NOT EXISTS umfrage_fragen (
  id text PRIMARY KEY,
  umfrage_id text NOT NULL REFERENCES umfragen (id),
  position integer NOT NULL,
  text text NOT NULL,
  freitext boolean NOT NULL,
  max_antworten integer
)
