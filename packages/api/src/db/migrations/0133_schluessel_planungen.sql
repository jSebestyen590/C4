-- Planned handovers: the key goes to an_sub at the given time. The previous step (or the current
-- holder) is implicit. Removed when the matching Uebergabe is recorded.
CREATE TABLE IF NOT EXISTS schluessel_planungen (
  id text PRIMARY KEY,
  schluessel_id text NOT NULL REFERENCES schluessel (id),
  an_sub text NOT NULL REFERENCES mitglieder (sub),
  datum date NOT NULL,
  ab text,
  bis text,
  notiz text,
  anfrage_id text REFERENCES schluessel_anfragen (id),
  erstellt_von text NOT NULL,
  erstellt timestamptz NOT NULL DEFAULT now()
)
