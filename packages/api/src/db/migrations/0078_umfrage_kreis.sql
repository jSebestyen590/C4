-- Posten and individual members in the mandatory or optional circle of a poll; ref is a Posten id
-- or a member sub (no foreign key, the circle is evaluated against the current data).
CREATE TABLE IF NOT EXISTS umfrage_kreis (
  umfrage_id text NOT NULL REFERENCES umfragen (id),
  pflicht boolean NOT NULL,
  art text NOT NULL CHECK (art IN ('posten', 'person')),
  ref text NOT NULL,
  PRIMARY KEY (umfrage_id, pflicht, art, ref)
)
