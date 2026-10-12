CREATE TABLE IF NOT EXISTS mitglieder (
  sub text PRIMARY KEY,
  vorname text NOT NULL,
  nachname text NOT NULL,
  adresse text,
  telefon text,
  ueber_mich text,
  profilbild_key text,
  status text NOT NULL DEFAULT 'anwaerter',
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
