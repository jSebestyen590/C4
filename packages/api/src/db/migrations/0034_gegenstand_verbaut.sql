-- Pieces of a Gegenstand built in for good at a place given as free text ("unter der Bar"); they
-- are not on any Platz and lower the number of pieces that can be put on Plätze.
CREATE TABLE IF NOT EXISTS gegenstand_verbaut (
  id text PRIMARY KEY,
  gegenstand_id text NOT NULL REFERENCES gegenstaende (id),
  ort text NOT NULL,
  anzahl integer NOT NULL,
  CHECK (anzahl >= 1)
)
