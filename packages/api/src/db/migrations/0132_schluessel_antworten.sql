-- One answer per member and request: zusage, ablehnung or gegenvorschlag (with datum/ab/bis/notiz).
-- schluessel_id: the key a responder offers for a Bedarf without a named key.
CREATE TABLE IF NOT EXISTS schluessel_antworten (
  id text PRIMARY KEY,
  anfrage_id text NOT NULL REFERENCES schluessel_anfragen (id),
  sub text NOT NULL REFERENCES mitglieder (sub),
  art text NOT NULL,
  datum date,
  ab text,
  bis text,
  notiz text,
  schluessel_id text REFERENCES schluessel (id),
  erstellt timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anfrage_id, sub)
)
