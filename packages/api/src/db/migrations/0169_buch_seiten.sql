-- Buch: pages (Strichliste). Exactly one of mitglied_sub / extern_name is set; the number is unique among active pages (enforced in the app with sperren).
CREATE TABLE IF NOT EXISTS buch_seiten (
  id text PRIMARY KEY,
  nummer integer NOT NULL,
  mitglied_sub text,
  extern_name text,
  angelegt_von text NOT NULL,
  angelegt_am timestamptz NOT NULL,
  archiviert_am timestamptz
)