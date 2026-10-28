CREATE TABLE IF NOT EXISTS event_vorlagen (
  id text PRIMARY KEY,
  titel text NOT NULL,
  beschreibung text,
  kategorie_id text REFERENCES event_kategorien (id),
  beginn_zeit text NOT NULL,
  ende_zeit text NOT NULL,
  archiviert boolean NOT NULL DEFAULT false
)
