-- OneDrive connection of the club (single row, id 'onedrive'); see docs/bilder.md. Secret and tokens never leave the API.
CREATE TABLE IF NOT EXISTS onedrive_verbindung (
  id text PRIMARY KEY,
  client_id text,
  client_secret text,
  basis_pfad text NOT NULL DEFAULT 'Cloud4/Bilder',
  refresh_token text,
  access_token text,
  access_ablauf timestamptz,
  konto text,
  verbunden_von text,
  verbunden_am timestamptz,
  fehler text,
  token_erneuert_am timestamptz
)
