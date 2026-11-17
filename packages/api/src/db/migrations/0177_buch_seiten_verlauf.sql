-- Buch: history of a page (insert-only): angelegt, nummer (renumbered), archiviert, reaktiviert.
CREATE TABLE IF NOT EXISTS buch_seiten_verlauf (
  id text PRIMARY KEY,
  seite_id text NOT NULL REFERENCES buch_seiten (id),
  art text NOT NULL CHECK (art IN ('angelegt', 'nummer', 'archiviert', 'reaktiviert')),
  nummer integer,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)