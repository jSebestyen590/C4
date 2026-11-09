-- External people who rent the club for a private party (see docs/privatpartys.md). Not members; no foreign key.
CREATE TABLE IF NOT EXISTS privatparty_personen (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  kontakt text,
  notizen text,
  angelegt_von text,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
)
