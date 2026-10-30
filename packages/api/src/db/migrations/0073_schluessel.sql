-- Club keys; the holder is a member (halter_sub), a person without the app (halter_name) or nobody.
CREATE TABLE IF NOT EXISTS schluessel (
  id text PRIMARY KEY,
  name text NOT NULL,
  beschreibung text,
  halter_sub text REFERENCES mitglieder (sub),
  halter_name text,
  halter_seit timestamptz,
  archiviert boolean NOT NULL DEFAULT false,
  CHECK (halter_sub IS NULL OR halter_name IS NULL)
)
