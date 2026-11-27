-- Finanzen: external recipients of Rechnungen (editable master data, archived instead of deleted).
CREATE TABLE IF NOT EXISTS fin_rechnungsempfaenger (
  id text PRIMARY KEY,
  name text NOT NULL,
  anschrift text NOT NULL,
  email text,
  ust_id text,
  archiviert boolean NOT NULL DEFAULT false
)