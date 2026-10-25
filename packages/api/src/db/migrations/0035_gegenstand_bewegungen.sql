-- History of a Gegenstand: Zugänge (gekauft, Ersatz, …) and Abgänge (verloren, kaputt, …). The sum
-- is kept in gegenstaende.anzahl by the API. ort is a display snapshot of the Platz the pieces went
-- to or came from (no foreign key, so places stay deletable); erstellt_von is a Cognito sub.
CREATE TABLE IF NOT EXISTS gegenstand_bewegungen (
  id text PRIMARY KEY,
  gegenstand_id text NOT NULL REFERENCES gegenstaende (id),
  art text NOT NULL,
  grund text NOT NULL,
  anzahl integer NOT NULL,
  datum date NOT NULL,
  kommentar text,
  ort text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  CHECK (art IN ('zugang', 'abgang')),
  CHECK (anzahl >= 1)
)
