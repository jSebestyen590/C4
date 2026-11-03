-- Meeting minutes (see docs/protokolle.md). inhalt = TipTap document as JSON text, kopf = header (participation overrides, EMs, guests, snapshot) as JSON text.
-- erstellt_von / geaendert_von are Cognito subs without a foreign key; event_id is checked in the API.
CREATE TABLE IF NOT EXISTS protokolle (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  inhalt text NOT NULL,
  kopf text NOT NULL,
  status text NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf', 'abgeschlossen')),
  version integer NOT NULL DEFAULT 1,
  erstellt_von text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  geaendert_von text,
  geaendert_am timestamptz NOT NULL DEFAULT now()
)
