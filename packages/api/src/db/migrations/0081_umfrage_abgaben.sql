-- Who voted; erneut_noetig is set when an edit invalidated the vote. Never exposed for anonymous polls.
CREATE TABLE IF NOT EXISTS umfrage_abgaben (
  umfrage_id text NOT NULL REFERENCES umfragen (id),
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  abgegeben_am timestamptz NOT NULL DEFAULT now(),
  erneut_noetig boolean NOT NULL DEFAULT false,
  PRIMARY KEY (umfrage_id, mitglied_sub)
)
