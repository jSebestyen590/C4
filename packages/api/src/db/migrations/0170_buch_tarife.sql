-- Buch: Strichwert and maximum overdraft per member status, valid from a date (insert-only).
CREATE TABLE IF NOT EXISTS buch_tarife (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('anwaerter', 'mitglied', 'em', 'extern')),
  strichwert_cent integer NOT NULL CHECK (strichwert_cent > 0),
  max_ueberzug_cent integer NOT NULL CHECK (max_ueberzug_cent >= 0),
  gueltig_ab date NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)